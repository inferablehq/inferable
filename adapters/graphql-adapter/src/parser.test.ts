import { describe, it } from "node:test";
import assert from "node:assert";
import { parseGraphQLSchema } from "./parser";
import fs from "node:fs";
import path from "node:path";
describe("GraphQL Schema Parser", () => {
  it("should parse a simple GraphQL schema", () => {
    const input = fs.readFileSync(
      path.join(__dirname, "tests", "github.gql"),
      "utf-8"
    );

    const result = parseGraphQLSchema(input);

    console.log(result);
  });
});
