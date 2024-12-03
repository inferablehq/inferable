import crypto from "crypto";
import {
  buildSchema,
  GraphQLSchema,
  GraphQLType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
} from "graphql";
import { approvalRequest, blob, ContextInput, Inferable } from "inferable";
import { FunctionRegistrationInput } from "inferable/bin/types";
import fetch from "node-fetch";
import { z } from "zod";
import type { DataConnector } from "../types";

export class GraphQLClient implements DataConnector {
  private schema: GraphQLSchema | null = null;
  private initialized = false;
  private operations: ReturnType<
    typeof this.graphqlOperationToInferableFunction
  >[] = [];

  constructor(
    private params: {
      name?: string;
      schemaUrl: string;
      endpoint: string;
      defaultHeaders?: Record<string, string>;
      privacyMode: boolean;
      paranoidMode: boolean;
    },
  ) {}

  public initialize = async () => {
    try {
      const response = await fetch(this.params.schemaUrl);
      const schemaSDL = await response.text();
      this.schema = buildSchema(schemaSDL);
      console.log(
        `GraphQL schema loaded successfully from ${this.params.schemaUrl}`,
      );

      // Parse the schema and extract operations
      const queryType = this.schema.getQueryType();
      const mutationType = this.schema.getMutationType();

      if (queryType) {
        const fields = queryType.getFields();
        for (const [fieldName, field] of Object.entries(fields)) {
          const operation = this.graphqlOperationToInferableFunction(
            fieldName,
            field,
            "query",
          );
          this.operations.push(operation);
        }
      }

      if (mutationType) {
        const fields = mutationType.getFields();
        for (const [fieldName, field] of Object.entries(fields)) {
          const operation = this.graphqlOperationToInferableFunction(
            fieldName,
            field,
            "mutation",
          );
          this.operations.push(operation);
        }
      }

      console.log(
        `Loaded ${this.operations.length} operations from GraphQL schema`,
      );

      if (this.params.privacyMode) {
        console.log(
          "Privacy mode is enabled, response data will not be sent to the model.",
        );
      }

      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize GraphQL connection:", error);
      throw error;
    }
  };

  private graphqlOperationToInferableFunction = (
    fieldName: string,
    field: any,
    operationType: "query" | "mutation",
  ): FunctionRegistrationInput<any> => {
    const args = field.args || [];
    const hasArguments = args.length > 0;

    const operationDefinition = `${operationType} ${fieldName}${
      hasArguments
        ? "($args: " +
          field.args.map((arg: any) => `${arg.name}: ${arg.type}`).join(", ") +
          ")"
        : ""
    } {
      ${fieldName}${hasArguments ? "(args: $args)" : ""}
    }`;

    return {
      name: `${operationType}${fieldName}`,
      description: `GraphQL ${operationType} operation: ${operationDefinition}
To understand the input and output types for this operation, use the searchGraphQLDefinition function with:
{
  "operation": "${operationType}",
  "fieldName": "${fieldName}"
}`,
      func: this.executeRequest,
      schema: {
        input: z.object({
          query: z
            .string()
            .describe(
              `The full graphql ${operationType} to execute: ${operationDefinition} ${fieldName} ${hasArguments ? `($args)` : ``} { ... }`,
            ),
          variables: hasArguments
            ? z
                .record(z.any())
                .describe(
                  `Operation variables. Use searchGraphQLDefinition to see the required types.`,
                )
            : z.undefined(),
        }),
      },
    };
  };

  executeRequest = async (
    input: {
      query: string;
      variables?: Record<string, any>;
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

    if (!this.initialized) throw new Error("GraphQL schema not initialized");
    if (!this.schema) throw new Error("GraphQL schema not initialized");

    // Merge default headers with the Content-Type header
    const headers = {
      "Content-Type": "application/json",
      ...this.params.defaultHeaders,
    };

    const response = await fetch(this.params.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });

    const data = await response.json();

    if (this.params.privacyMode) {
      return {
        message:
          "This request was executed in privacy mode. Data was returned to the user directly.",
        blob: blob({
          name: "Results",
          type: "application/json",
          data,
        }),
      };
    }

    return data;
  };

  private connectionStringHash = () => {
    return crypto
      .createHash("sha256")
      .update(this.params.schemaUrl)
      .digest("hex")
      .substring(0, 8);
  };

  createService = (client: Inferable) => {
    const service = client.service({
      name: this.params.name ?? `graphql${this.connectionStringHash()}`,
    });

    // Register the search function first
    service.register(this.searchGraphQLDefinitionToInferableFunction());

    // Then register all the operations
    this.operations.forEach((operation) => {
      service.register(operation);
    });

    return service;
  };

  private searchGraphQLDefinitionToInferableFunction =
    (): FunctionRegistrationInput<any> => {
      return {
        name: "searchGraphQLDefinition",
        description:
          "Search for input and output type definitions of a GraphQL operation",
        func: async (input: {
          operation: "query" | "mutation";
          fieldName: string;
        }) => {
          if (!this.schema) throw new Error("GraphQL schema not initialized");

          const operationType =
            input.operation === "query"
              ? this.schema.getQueryType()
              : this.schema.getMutationType();

          if (!operationType) {
            throw new Error(`No ${input.operation} type found in schema`);
          }

          const field = operationType.getFields()[input.fieldName];
          if (!field) {
            throw new Error(
              `No field ${input.fieldName} found in ${input.operation} type`,
            );
          }

          const args = field.args || [];
          const argTypes: Record<string, any> = {};

          args.forEach((arg) => {
            argTypes[arg.name] = {
              type: this.getTypeString(arg.type),
              definition: this.getTypeDefinition(arg.type),
            };
          });

          const returnType = {
            type: this.getTypeString(field.type),
            definition: this.getTypeDefinition(field.type),
          };

          return {
            operation: input.operation,
            fieldName: input.fieldName,
            inputTypes: argTypes,
            outputType: returnType,
          };
        },
        schema: {
          input: z.object({
            operation: z.enum(["query", "mutation"]),
            fieldName: z.string(),
          }),
        },
      };
    };

  private getTypeString = (type: GraphQLType): string => {
    if (isNonNullType(type)) {
      return `${this.getTypeString(type.ofType)}!`;
    }
    if (isListType(type)) {
      return `[${this.getTypeString(type.ofType)}]`;
    }
    return type.toString();
  };

  private getTypeDefinition = (type: GraphQLType): any => {
    if (isNonNullType(type)) {
      return this.getTypeDefinition(type.ofType);
    }
    if (isListType(type)) {
      return {
        type: "list",
        ofType: this.getTypeDefinition(type.ofType),
      };
    }
    if (isObjectType(type) || isInputObjectType(type)) {
      const fields = type.getFields();
      const fieldDefs: Record<string, any> = {};

      Object.entries(fields).forEach(([fieldName, field]) => {
        fieldDefs[fieldName] = {
          type: this.getTypeString(field.type),
          description: field.description || undefined,
        };

        if ("args" in field && field.args.length > 0) {
          fieldDefs[fieldName].args = field.args.map((arg) => ({
            name: arg.name,
            type: this.getTypeString(arg.type),
            description: arg.description || undefined,
          }));
        }
      });

      return {
        type: "object",
        fields: fieldDefs,
      };
    }

    return {
      type: "scalar",
      name: type.toString(),
    };
  };
}
