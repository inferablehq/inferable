import test from "node:test";
import { GraphQLSchemaParser } from "./parser";

test("should parse a simple query", async () => {
  const schema = await fetch(
    "https://docs.github.com/public/fpt/schema.docs.graphql",
  );
  const schemaString = await schema.text();

  const parser = new GraphQLSchemaParser(schemaString);

  const parsed = {
    types: parser.parseTypes(),
    queries: parser.parseQueries(),
    mutations: parser.parseMutations(),
  };

  console.log(JSON.stringify(parsed, null, 2));
});
