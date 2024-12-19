import { ApolloServer, ApolloServerPlugin } from "@apollo/server";
import { printSchema } from "graphql";
import { ContextInput, Inferable } from "inferable";
import { parseGraphQLSchema } from "./parser";

export type InferableGraphQLContext = { inferable?: ContextInput };

interface AdapterOptions<TContext extends InferableGraphQLContext> {
  inferableClient: Inferable;
  /**
   * By making sure that the apollo server accept TContext,
   * we kinda force the host server to pass in the correct context
   * and we can use it in the inferable client.
   */
  apolloServer: ApolloServer<TContext>;
}

export function inferableAdapter<TContext extends InferableGraphQLContext>(
  options: AdapterOptions<TContext>
): ApolloServerPlugin<TContext> {
  const { inferableClient, apolloServer } = options;

  return {
    async serverWillStart(opts) {
      const service = inferableClient.service({
        name: "graphql",
      });

      const schemaString = printSchema(opts.schema);

      const { queries, mutations, types } = parseGraphQLSchema(schemaString);

      for (const operation of [...queries, ...mutations]) {
        service.register({
          name: operation.functionName,
          schema: {
            input: {
              $schema: "http://json-schema.org/draft-07/schema#",
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: `This is the graphql query or the mutation for the ${operation.name} field. `,
                },
                args: {
                  type: "object",
                  description: `This is the arguments for the ${operation.name} field. Empty if no arguments are required.`,
                },
              },
              required: ["query", "args"],
            },
          },
          description: `
            <query>
              ${operation.definition}
            </query>
            <relatedTypes>
              ${operation.relatedTypes
                .map(
                  (type) =>
                    `<type name="${type.name}">${type.definition}</type>`
                )
                .join("")}
            </relatedTypes>
          `,
          func: async (input, context) => {
            return apolloServer
              .executeOperation(
                {
                  query: input.query,
                  variables: input.args,
                },
                { contextValue: { inferable: context } as TContext }
              )
              .then((res) => ({
                ...res.body,
                input,
              }));
          },
        });
      }

      service.register({
        name: "lookupGraphQLTypes",
        schema: {
          input: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              type: {
                type: "string",
                description: "The type to lookup.",
              },
            },
            required: ["type"],
          },
        },
        description: `
          This is a function that will lookup the graphql types in the schema. Supports partial matches.
        `,
        func: async (input) => {
          return types.find((type) =>
            type.name.toLowerCase().includes(input.type.toLowerCase())
          );
        },
      });

      service.register({
        name: "peekGraphQLSchemaAtString",
        schema: {
          input: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "The string to peek at. Could be any string. Returns all matches. Use peekGraphQLSchemaAtLocation if you want to peek at a specific location.",
              },
            },
            required: ["query"],
          },
        },
        description: `
          This is a function that will peek at the graphql schema.
        `,
        func: async (input) => {
          const lowerSchema = schemaString.toLowerCase();
          const lowerQuery = input.query.toLowerCase();

          // Find all occurrences
          const matches = [];
          let currentIndex = 0;

          while (true) {
            const index = lowerSchema.indexOf(lowerQuery, currentIndex);
            if (index === -1) break;

            matches.push({
              index,
              text: schemaString.slice(Math.max(0, index - 100), index + 100),
              start: Math.max(0, index - 100),
              end: index + 100,
            });

            currentIndex = index + 1;
          }

          return matches;
        },
      });

      service.register({
        name: "peekGraphQLSchemaAtLocation",
        schema: {
          input: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              start: {
                type: "number",
                description: "The start location.",
              },
              end: {
                type: "number",
                description: "The end location. Defaults to start + 100.",
              },
            },
            required: ["start"],
          },
        },
        description: `
          This is a function that will peek at the graphql schema at a specific location.
        `,
        func: async (input) => {
          return schemaString.slice(
            input.start,
            input.end ?? input.start + 100
          );
        },
      });

      await service.start();
    },
  };
}
