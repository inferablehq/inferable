import {
  visit,
  FieldDefinitionNode,
  InputValueDefinitionNode,
  DocumentNode,
  VariableDefinitionNode,
  TypeDefinitionNode,
} from "graphql";

// GraphQL (input) types which may be referenced in the schema
type TypeDefinitions = Record<string, TypeDefinitionNode>;

import type { JSONSchema4Type, JSONSchema4Object } from "json-schema";

function toJsonSchema({
  document,
  include: schema,
}: {
  document: DocumentNode;
  include?: DocumentNode;
}): Record<string, JSONSchema4Type> {
  const jsonSchemas: Record<string, JSONSchema4Type> = {};

  const schemaInputTypes = schema ? getSchemaInputTypes(schema) : {};

  visit(document, {
    OperationDefinition(node) {
      if (node.operation === "query" || node.operation === "mutation") {
        if (!node.name) {
          throw new Error("Missing name for operation");
        }

        const operationName = node.name.value;

        const variableDefinitions = node.variableDefinitions || [];

        // Try and find the description for operation arguments.
        // Operations arguments themself can't have descriptions:
        // https://github.com/graphql/graphql-js/blob/9a91e338101b94fb1cc5669dd00e1ba15e0f21b3/src/language/parser.ts#L286
        const descriptionMap = new Map<string, string>();
        node.selectionSet.selections.forEach((selection) => {
          if (selection.kind === "Field") {
            // Search for the Field (Query, Mutation, etc.) in the schema
            !!schema &&
              visit(schema!, {
                FieldDefinition(node) {
                  if (node.name.value === selection.name.value) {
                    node.arguments?.forEach((arg) => {
                      // Find the description for the argument by the same name
                      if (arg.description?.value) {
                        descriptionMap.set(
                          arg.name.value,
                          arg.description.value,
                        );
                      }
                    });
                  }
                },
              });
          }
        });

        const properties: Record<string, JSONSchema4Type> = {};
        const required: string[] = [];

        variableDefinitions.forEach((varDef) => {
          if (!varDef) return;
          const { jsonSchema, isRequired } = jsonSchemaFromGraphQL(
            varDef,
            schemaInputTypes,
          );

          if (descriptionMap.has(varDef.variable.name.value)) {
            // If the type has a description and the variable also does, combine them
            if (!jsonSchema.description) {
              `${varDef.variable.name.value} - ${descriptionMap.get(varDef.variable.name.value)}`;
            }

            jsonSchema.description = descriptionMap.get(
              varDef.variable.name.value,
            )!;
          }
          properties[varDef.variable.name.value] = jsonSchema;
          if (isRequired) {
            required.push(varDef.variable.name.value);
          }
        });

        jsonSchemas[operationName] = {
          type: "object",
          properties,
          required: required.length > 0 ? required : [],
        };
      }
    },
  });
  return jsonSchemas;
}

function getSchemaInputTypes(schemaAst: DocumentNode): TypeDefinitions {
  const types: TypeDefinitions = {};

  visit(schemaAst, {
    InputObjectTypeDefinition(node) {
      types[node.name.value] = node;
    },
    EnumTypeDefinition(node) {
      types[node.name.value] = node;
    },
    InterfaceTypeDefinition(node) {
      types[node.name.value] = node;
    },
    ScalarTypeDefinition(node) {
      types[node.name.value] = node;
    },
  });

  return types;
}

function createTypeSchema(
  typeName: string,
  schemaTypes: TypeDefinitions,
): JSONSchema4Object {
  const type = schemaTypes[typeName];
  if (!type) {
    return { $ref: `#/definitions/${typeName}` };
  }
  const description = type.description?.value ?? null;

  if (type.kind === "EnumTypeDefinition") {
    return {
      type: "string",
      enum: type.values?.map((value) => value.name.value) ?? [],
      ...(description ? { description } : {}),
    };
  }

  const properties: Record<string, JSONSchema4Type> = {};
  const required: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (type as any).fields?.forEach((field: any) => {
    const { jsonSchema, isRequired } = jsonSchemaFromGraphQL(
      field,
      schemaTypes,
    );
    properties[field.name.value] = jsonSchema;
    if (isRequired) {
      required.push(field.name.value);
    }
  });

  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : [],
    ...(description ? { description } : {}),
  };
}

function jsonSchemaFromGraphQL(
  node: FieldDefinitionNode | InputValueDefinitionNode | VariableDefinitionNode,
  schemaTypes: TypeDefinitions,
): { jsonSchema: JSONSchema4Object; isRequired: boolean } {
  let jsonSchema: JSONSchema4Object;
  let isRequired = false;

  switch (node.type.kind) {
    case "NamedType":
      jsonSchema = getBaseJsonSchemaType(node.type.name.value, schemaTypes);
      break;
    case "ListType":
      jsonSchema = {
        type: "array",
        items: jsonSchemaFromGraphQL(
          { ...node, type: node.type.type },
          schemaTypes,
        ).jsonSchema,
      };
      break;
    case "NonNullType":
      ({ jsonSchema } = jsonSchemaFromGraphQL(
        { ...node, type: node.type.type },
        schemaTypes,
      ));
      isRequired = true;
      break;
    default:
      throw new Error(`Unsupported type kind: ${node.type.kind}`);
  }

  if (node.kind !== "VariableDefinition" && node.description) {
    jsonSchema.description = node.description.value;
  }

  return { jsonSchema, isRequired };
}

function getBaseJsonSchemaType(
  typeName: string,
  schemaTypes: TypeDefinitions,
): JSONSchema4Object {
  switch (typeName) {
    case "Int":
      return { type: "integer" };
    case "Float":
      return { type: "number" };
    case "String":
      return { type: "string" };
    case "Boolean":
      return { type: "boolean" };
    case "ID":
      return { type: "string" };
    default:
      if (schemaTypes[typeName]) {
        return createTypeSchema(typeName, schemaTypes);
      }
      throw new Error(`Unknown type ${typeName}`);
  }
}

export { toJsonSchema };
