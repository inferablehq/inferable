import $RefParser from "@apidevtools/json-schema-ref-parser";
import { ApolloServer, ApolloServerPlugin } from "@apollo/server";
import { getIntrospectionQuery, graphqlSync } from "graphql";
import { fromIntrospectionQuery } from "graphql-2-json-schema";
import { ContextInput, Inferable } from "inferable";

interface JSONSchemaWithProperties {
  properties?: {
    Query?: {
      properties?: {
        [key: string]: {
          properties?: {
            return?: any;
            arguments?: any;
          };
        };
      };
    };
    Mutation?: {
      properties?: {
        [key: string]: {
          properties?: {
            return?: any;
            arguments?: any;
          };
        };
      };
    };
  };
}

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

      const introspection = graphqlSync({
        schema: opts.schema,
        source: getIntrospectionQuery(),
      });

      if (!introspection.data) {
        throw new Error("No introspection data");
      }

      const introspectedSchema = fromIntrospectionQuery(
        introspection.data as any,
        {}
      );

      const jsonSchema = (await $RefParser.dereference(
        introspectedSchema
      )) as JSONSchemaWithProperties;

      // Handle Query fields
      const queryFields = opts.schema.getQueryType()?.getFields();
      if (queryFields) {
        for (const fieldName in queryFields) {
          const fieldSchema =
            jsonSchema.properties?.Query?.properties?.[fieldName];

          const args = fieldSchema?.properties?.arguments;

          service.register({
            name: `query${fieldName}`,
            schema: {
              input: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                properties: {
                  args,
                  graphqlQuery: {
                    type: "string",
                    description: `This is the graphql query for the ${fieldName} field. Constructed from the schema. If there are any arguments, they are passed in as variables under $args.`,
                  },
                },
                required: ["args", "graphqlQuery"],
              },
            },
            func: async (args, context) => {
              try {
                const result = await apolloServer
                  .executeOperation(
                    {
                      query: args.graphqlQuery,
                      variables: {
                        args: args.args,
                      },
                    },
                    { contextValue: { inferable: context } as TContext }
                  )
                  .then((res) => res.body);

                return JSON.stringify(result);
              } catch (e) {
                throw new Error(
                  `Error executing operation: ${e}. The query was: ${args.graphqlQuery}`
                );
              }
            },
          });
        }
      }

      // Handle Mutation fields
      const mutationFields = opts.schema.getMutationType()?.getFields();
      if (mutationFields) {
        for (const fieldName in mutationFields) {
          const fieldSchema =
            jsonSchema.properties?.Mutation?.properties?.[fieldName];

          const args = fieldSchema?.properties?.arguments;

          console.log(args.properties);

          service.register({
            name: `mutation${fieldName}`,
            schema: {
              input: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                properties: {
                  args,
                  graphqlQuery: {
                    type: "string",
                    description: `This is the graphql mutation for the ${fieldName} field. Constructed from the schema. If there are any arguments, they are passed in as variables under $args.`,
                  },
                },
                required: ["args", "graphqlQuery"],
              },
            },
            func: async (input, context) => {
              try {
                const result = await apolloServer
                  .executeOperation(
                    {
                      query: input.graphqlQuery,
                      variables: input.args,
                    },
                    { contextValue: { inferable: context } as TContext }
                  )
                  .then((res) => res.body);

                return JSON.stringify(result);
              } catch (e) {
                throw new Error(
                  `Error executing operation: ${e}. The mutation was: ${input.graphqlQuery}`
                );
              }
            },
          });
        }
      }

      await service.start();
    },
  };
}
