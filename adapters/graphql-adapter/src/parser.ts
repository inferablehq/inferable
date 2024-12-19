import { buildSchema, GraphQLError, GraphQLObjectType } from "graphql";
import { writeFileSync } from "node:fs";
import util from "node:util";

type TypeField = {
  name: string;
  definition: string;
};

type OperationField = {
  type: "query" | "mutation";
  name: string;
  functionName: string;
  definition: string;
  relatedTypes: TypeField[];
};

const pickDeepKeys = (obj: any, keys: string[]): Record<string, any> => {
  if (typeof obj !== "object" || obj === null) {
    return {};
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => pickDeepKeys(item, keys));
  }

  const result: Record<string, any> = {};

  for (const key in obj) {
    if (keys.includes(key)) {
      result[key] = obj[key];
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      const picked = pickDeepKeys(obj[key], keys);
      if (Object.keys(picked).length > 0) {
        result[key] = picked;
      }
    }
  }

  return result;
};

const functionName = (type: "query" | "mutation", name: string) => {
  return `${type}${name.charAt(0).toUpperCase() + name.slice(1)}`;
};

export function parseGraphQLSchema(schemaString: string) {
  const schema = buildSchema(schemaString);
  const queries = schema.getQueryType();
  const types = schema.getTypeMap();
  const mutation = schema.getMutationType();
  const typeFields: TypeField[] = Object.values(types)
    .filter((type) => type.astNode?.loc) // Only include types that have locations
    .map((type) => ({
      name: type.name,
      definition: schemaString.slice(
        type.astNode?.loc?.start ?? 0,
        type.astNode?.loc?.end ?? 0
      ),
    }));

  const queryFields: OperationField[] =
    queries?.astNode?.fields?.map((field) => {
      const definition = schemaString.slice(
        field.loc?.start ?? 0,
        field.loc?.end ?? 0
      );

      const allWords = Array.from(definition.matchAll(/\b[a-zA-Z]+\b/g));

      const relatedTypes = allWords
        .map((match) => typeFields.find((type) => type.name === match[0]))
        .filter((type): type is TypeField => type !== undefined);

      return {
        type: "query",
        name: field.name.value,
        functionName: functionName("query", field.name.value),
        definition,
        relatedTypes,
      };
    }) ?? [];

  const mutationFields =
    mutation?.astNode?.fields?.map((field) => {
      const definition = schemaString.slice(
        field.loc?.start ?? 0,
        field.loc?.end ?? 0
      );

      const allWords = Array.from(definition.matchAll(/\b[a-zA-Z]+\b/g));

      const relatedTypes = allWords
        .map((match) => typeFields.find((type) => type.name === match[0]))
        .filter((type): type is TypeField => type !== undefined);

      return {
        type: "mutation",
        name: field.name.value,
        functionName: functionName("mutation", field.name.value),
        definition,
        relatedTypes,
      };
    }) ?? [];

  return {
    queries: queryFields,
    types: typeFields,
    mutations: mutationFields,
  };
}
