import { Run } from "../workflows";
import { buildMockTools, findRelevantTools } from "./run";
import { upsertServiceDefinition } from "../../service-definitions";
import { createOwner } from "../../test/util";
import { ulid } from "ulid";

describe("findRelevantTools", () => {
  it("should return explicitly attached tools", async () => {
    const owner = await createOwner();
    await upsertServiceDefinition({
      service: "testService",
      definition: {
        name: "testService",
        functions: [
          {
            name: "someFunction",
            schema: mockTargetSchema,
          },
          {
            name: "someOtherFunction",
            schema: mockTargetSchema,
          },
        ],
      },
      owner,
    });

    const workflow = {
      id: Math.random().toString(36).substring(2),
      clusterId: owner.clusterId,
      status: "running" as const,
      attachedFunctions: ["testService_someFunction"],
    };

    const tools = await findRelevantTools({
      workflow,
      messages: [
        {
          data: {
            message: "Call someFunction",
          },
          type: "human" as const,
          clusterId: owner.clusterId,
          runId: "test-workflow-id",
          id: ulid(),
        },
      ],
      status: "running",
      waitingJobs: [],
      allAvailableTools: [],
    });

    expect(tools.map((tool) => tool.name)).toContain(
      "testService_someFunction",
    );
    expect(tools.map((tool) => tool.name)).not.toContain(
      "testService_someOtherFunction",
    );
  });
});

const mockTargetSchema = JSON.stringify({
  type: "object",
  properties: {
    test: {
      type: "string",
    },
  },
});

describe("buildMockTools", () => {
  let workflow: Run;

  const service = "testService";
  beforeAll(async () => {
    const owner = await createOwner();
    await upsertServiceDefinition({
      service,
      definition: {
        name: service,
        functions: [
          {
            name: "someFunction",
            schema: mockTargetSchema,
          },
        ],
      },
      owner,
    });

    workflow = {
      id: Math.random().toString(36).substring(2),
      clusterId: owner.clusterId,
      status: "running",
    };
  });

  it("should return an empty object if no mocks are defined", async () => {
    const tools = await buildMockTools(workflow);
    expect(tools).toEqual({});
  });

  it("should return an empty object if test is not enabled", async () => {
    const tools = await buildMockTools({
      ...workflow,
      testMocks: {
        testService_someFunction: {
          output: {
            foo: "bar",
          },
        },
      },
    });
    expect(tools).toEqual({});
  });

  it("should return mock tools", async () => {
    const tools = await buildMockTools({
      ...workflow,
      test: true,
      testMocks: {
        testService_someFunction: {
          output: {
            foo: "bar",
          },
        },
      },
    });
    expect(Object.keys(tools)).toEqual(["testService_someFunction"]);

    const result = await tools["testService_someFunction"].func({ test: "" });
    expect(result).toBeDefined();
    expect(JSON.parse(result!)).toEqual({
      result: {
        foo: "bar",
      },
      resultType: "resolution",
      status: "success",
    });
  });
});
