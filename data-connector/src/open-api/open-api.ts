import { approvalRequest, blob, ContextInput, Inferable } from "inferable";
import { z } from "zod";
import type { DataConnector } from "../types";
import { OpenAPIV3 } from "openapi-types";
import crypto from "crypto";
import { FunctionRegistrationInput } from "inferable/bin/types";
import assert from "assert";

export class OpenAPIClient implements DataConnector {
  private spec: OpenAPIV3.Document | null = null;
  private initialized = false;
  private operations: ReturnType<
    typeof this.openApiOperationToInferableFunction
  >[] = [];

  constructor(
    private params: {
      name?: string;
      specUrl: string;
      endpoint?: string;
      maxResultLength: number;
      defaultHeaders?: Record<string, string>;
      privacyMode: boolean;
      paranoidMode: boolean;
    },
  ) {}

  public initialize = async () => {
    try {
      const response = await fetch(this.params.specUrl);
      this.spec = (await response.json()) as OpenAPIV3.Document;
      console.log(
        `OpenAPI spec loaded successfully from ${this.params.specUrl}`,
      );

      // Convert paths and their operations into functions
      for (const [path, pathItem] of Object.entries(this.spec.paths)) {
        if (!pathItem) continue;

        const operations = ["get", "post", "put", "delete", "patch"] as const;

        for (const method of operations) {
          const operation = pathItem[method];
          if (!operation || !operation.operationId) continue;

          const inferableFunction = this.openApiOperationToInferableFunction(
            operation,
            path,
            method,
          );

          this.operations.push(inferableFunction);
        }
      }

      console.log(
        `Loaded ${this.operations.length} operations from OpenAPI spec`,
      );

      if (this.params.privacyMode) {
        console.log(
          "Privacy mode is enabled, response data will not be sent to the model.",
        );
      }

      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize OpenAPI connection:", error);
      throw error;
    }
  };

  private openApiOperationToInferableFunction = (
    operation: OpenAPIV3.OperationObject,
    path: string,
    method: string,
  ): FunctionRegistrationInput<any> => {
    // Build input parameters schema
    const parameters = operation.parameters || [];
    const parameterSchemas: Record<string, any> = {};

    // Group parameters by their location (path, query, header)
    const parametersByLocation = {
      path: [] as string[],
      query: [] as string[],
      header: [] as string[],
    };

    parameters.forEach((param) => {
      if ("name" in param && "in" in param) {
        parametersByLocation[
          param.in as keyof typeof parametersByLocation
        ]?.push(param.name);
        if (param.schema) {
          parameterSchemas[param.name] = param.schema;
        }
      }
    });

    // Handle request body if it exists
    let bodySchema:
      | OpenAPIV3.ReferenceObject
      | OpenAPIV3.SchemaObject
      | undefined = undefined;
    if (operation.requestBody && "content" in operation.requestBody) {
      const content = operation.requestBody.content["application/json"];
      if (content?.schema) {
        bodySchema = content.schema;
      }
    }

    assert(operation.operationId, "Operation ID is required");
    assert(path, "Path is required");

    const hasParameters = Object.keys(parameterSchemas).length > 0;

    const summary =
      operation.summary ||
      operation.description ||
      `${method.toUpperCase()} ${path}`;

    return {
      name: operation.operationId,
      description: `${summary}. Ask the user to provide values for any required parameters.`,
      func: this.executeRequest,
      schema: {
        input: z.object({
          path: path.includes(":")
            ? z
                .string()
                .describe(
                  `Must be ${path} with values substituted for any path parameters.`,
                )
            : z.literal(path),
          method: z.literal(method.toUpperCase()),
          parameters: hasParameters
            ? z
                .record(z.any())
                .optional()
                .describe(
                  `URL and query parameters. Must match the following: ${JSON.stringify(
                    parametersByLocation,
                  )}`,
                )
            : z.undefined(),
          body: bodySchema
            ? z
                .any()
                .optional()
                .describe(
                  `Request body. Must match: ${JSON.stringify(bodySchema)}`,
                )
            : z.undefined(),
        }),
      },
    };
  };

  executeRequest = async (
    input: {
      path: string;
      method: string;
      parameters?: Record<string, any>;
      body?: any;
    },
    ctx: ContextInput,
  ) => {
    if (this.params.paranoidMode) {
      if (!ctx.approved) {
        console.log("Request requires approval");
        return approvalRequest();
      } else {
        console.log("Request approved");
      }
    }

    if (!this.initialized) throw new Error("OpenAPI spec not initialized");
    if (!this.spec) throw new Error("OpenAPI spec not initialized");

    // Use the provided endpoint or fall back to the spec's server URL
    let url = (
      this.params.endpoint ||
      this.spec.servers?.[0]?.url ||
      ""
    ).toString();
    let finalPath = input.path;

    if (input.parameters) {
      // Replace path parameters
      Object.entries(input.parameters).forEach(([key, value]) => {
        finalPath = finalPath.replace(
          `{${key}}`,
          encodeURIComponent(String(value)),
        );
      });
    }

    url += finalPath;

    // Merge default headers with the Content-Type header
    const headers = {
      "Content-Type": "application/json",
      ...this.params.defaultHeaders,
    };

    const response = await fetch(url, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });

    const data = await response.text();

    let parsed: object;

    try {
      parsed = JSON.parse(data);
    } catch (error) {
      parsed = {
        data,
      };
    }

    if (this.params.privacyMode) {
      return {
        message:
          "This request was executed in privacy mode. Data was returned to the user directly.",
        blob: blob({
          name: "Results",
          type: "application/json",
          data: parsed,
        }),
      };
    }

    if (JSON.stringify(parsed).length > this.params.maxResultLength) {
      return {
        message:
          "This query returned too much data. Data was returned to the user directly.",
        blob: blob({
          name: "Results",
          type: "application/json",
          data: parsed,
        }),
      };
    }

    return parsed;
  };

  private connectionStringHash = () => {
    return crypto
      .createHash("sha256")
      .update(this.params.specUrl)
      .digest("hex")
      .substring(0, 8);
  };

  createService = (client: Inferable) => {
    const service = client.service({
      name: this.params.name ?? `openapi${this.connectionStringHash()}`,
    });

    this.operations.forEach((operation) => {
      service.register(operation);
    });

    return service;
  };
}
