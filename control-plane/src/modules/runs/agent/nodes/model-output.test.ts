import { JsonSchema7ObjectType } from "zod-to-json-schema";
import { RunGraphState } from "../state";
import { AgentTool } from "../tool";
import { ulid } from "ulid";
import { buildModelSchema } from "./model-output";

describe("buildModelSchema", () => {
  let state: RunGraphState;
  let relevantSchemas: AgentTool[];
  let resultSchema: JsonSchema7ObjectType | undefined;

  beforeEach(() => {
  state = {
    messages: [
      {
        id: ulid(),
        clusterId: "test-cluster",
        runId: "test-run",
        data: {
          message: "What are your capabilities?",
        },
        type: "human",
      },
    ],
    waitingJobs: [],
    allAvailableTools: [],
    run: {
      id: "test-run",
      clusterId: "test-cluster",
    },
    additionalContext: "",
    status: "running",
  };
    relevantSchemas = [
      { name: "localTool1"},
      { name: "localTool2"},
      { name: "globalTool1"},
      { name: "globalTool2"},
    ] as AgentTool[],
    resultSchema = undefined;
  });

  it("returns a schema with 'message' when resultSchema is not provided", () => {
    const schema = buildModelSchema({ state, relevantSchemas, resultSchema });

    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("message");
    expect(schema.properties).not.toHaveProperty("result");
  });

  it("returns a schema with 'result' when resultSchema is provided", () => {
    resultSchema = {
      type: "object",
      properties: {
        foo: { type: "string" },
      },
      additionalProperties: false,
    };

    const schema = buildModelSchema({ state, relevantSchemas, resultSchema }) as any;

    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("result");
    expect(schema.properties).not.toHaveProperty("message");
    expect(schema.properties?.result?.description).toContain("final result");
  });

  it("includes 'done' and 'issue' fields", () => {
    const schema = buildModelSchema({ state, relevantSchemas, resultSchema }) as any;

    expect(schema.properties).toHaveProperty("done");
    expect(schema.properties).toHaveProperty("issue");
    expect(schema.properties.done.type).toBe("boolean");
    expect(schema.properties.issue.type).toBe("string");
  });

  it("builds the correct toolName enum from available tools", () => {
    const schema = buildModelSchema({ state, relevantSchemas, resultSchema });
    const invocations = schema.properties?.invocations as any;
    const items = invocations.items as JsonSchema7ObjectType;
    const toolName = items.properties?.toolName as any;

    expect(toolName).toBeDefined();
    expect(toolName?.enum).toContain("localTool1");
    expect(toolName?.enum).toContain("localTool2");
    expect(toolName?.enum).toContain("globalTool1");
    expect(toolName?.enum).toContain("globalTool2");
  });

  it("includes 'invocations' with correct structure", () => {
    const schema = buildModelSchema({ state, relevantSchemas, resultSchema });
    const invocations = schema.properties?.invocations as any;

    expect(invocations.type).toBe("array");
    const items = invocations.items as any;

    expect(items.type).toBe("object");
    expect(items.additionalProperties).toBe(false);
    expect(items.required).toEqual(["toolName", "input"]);

    expect(items.properties?.input.type).toBe("object");
    expect(items.properties?.input.additionalProperties).toBe(true);
  });

  it("does not include 'reasoning' by default", () => {
    const schema = buildModelSchema({ state, relevantSchemas, resultSchema });
    const invocations = schema.properties?.invocations as any;
    const items = invocations.items as JsonSchema7ObjectType;

    expect(items.properties).not.toHaveProperty("reasoning");
  });

  it("includes 'reasoning' when reasoningTraces is true", () => {
    state.run.reasoningTraces = true;
    const schema = buildModelSchema({ state, relevantSchemas, resultSchema });
    const invocations = schema.properties?.invocations as any;
    const items = invocations.items as any;

    expect(items.properties).toHaveProperty("reasoning");
    expect(items.properties?.reasoning?.type).toBe("string");
  });

  it("has additionalProperties set to false at top level", () => {
    const schema = buildModelSchema({ state, relevantSchemas, resultSchema });
    expect(schema.additionalProperties).toBe(false);
  });
});
