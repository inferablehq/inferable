import { approvalRequest, blob, ContextInput, Inferable } from "inferable";
import { z } from "zod";
import fetch from "node-fetch";
import type { DataConnector } from "./types";
import { OpenAPIV3 } from "openapi-types";
import crypto from "crypto";

export class OpenAPIClient implements DataConnector {
  private spec: OpenAPIV3.Document | null = null;
  private initialized: Promise<void>;

  constructor(
    private params: {
      name?: string;
      specUrl: string;
      endpoint?: string;
      defaultHeaders?: Record<string, string>;
      privacyMode: boolean;
      paranoidMode: boolean;
    },
  ) {
    this.initialized = this.initialize();
  }

  executeQuery(input: { query: string }, ctx: ContextInput): Promise<any> {
    throw new Error("Method not implemented.");
  }

  private initialize = async () => {
    try {
      const response = await fetch(this.params.specUrl);
      this.spec = (await response.json()) as OpenAPIV3.Document;
      console.log(
        `OpenAPI spec loaded successfully from ${this.params.specUrl}`,
      );

      if (this.params.privacyMode) {
        console.log(
          "Privacy mode is enabled, response data will not be sent to the model.",
        );
      }
    } catch (error) {
      console.error("Failed to initialize OpenAPI connection:", error);
      throw error;
    }
  };

  getContext = async () => {
    await this.initialized;
    if (!this.spec) throw new Error("OpenAPI spec not initialized");

    const context: any[] = [];

    // Convert paths and their operations into a structured context
    for (const [path, pathItem] of Object.entries(this.spec.paths)) {
      if (!pathItem) continue;

      const operations = ["get", "post", "put", "delete", "patch"] as const;

      for (const method of operations) {
        const operation = pathItem[method];
        if (!operation) continue;

        const endpoint = {
          path: path.substring(0, 100),
          method: method.toUpperCase(),
          summary: operation.summary?.substring(0, 100),
          parameters:
            operation.parameters
              ?.map((param) => {
                if ("name" in param) {
                  return {
                    name: param.name,
                    in: param.in,
                    required: param.required,
                    schema: param.schema,
                  };
                }
                return null;
              })
              .filter(Boolean) ?? [],
          requestBody: operation.requestBody
            ? {
                required: (operation.requestBody as OpenAPIV3.RequestBodyObject)
                  .required,
                content: Object.keys(
                  (operation.requestBody as OpenAPIV3.RequestBodyObject)
                    .content,
                ),
              }
            : null,
          responses: Object.entries(operation.responses).map(
            ([code, response]) => ({
              code,
              description: (response as OpenAPIV3.ResponseObject).description,
            }),
          ),
        };

        context.push(endpoint);
      }
    }

    return context;
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

    await this.initialized;
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

    const data = await response.json();

    if (this.params.privacyMode) {
      return {
        message:
          "This request was executed in privacy mode. Data was returned to the user directly.",
        blob: blob({
          name: "Results",
          type: "application/json",
          data: data,
        }),
      };
    }

    return data;
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

    service.register({
      name: "getContext",
      func: this.getContext,
      description: "Gets the OpenAPI specification schema.",
    });

    service.register({
      name: "executeRequest",
      func: this.executeRequest,
      description: "Executes an HTTP request against the OpenAPI endpoint.",
      schema: {
        input: z.object({
          path: z.string().describe("The endpoint path"),
          method: z.string().describe("The HTTP method"),
          parameters: z
            .record(z.any())
            .optional()
            .describe("URL and query parameters"),
          body: z.any().optional().describe("Request body"),
        }),
      },
    });

    return service;
  };
}
