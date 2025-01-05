import { Run } from "../";
import { buildMockTools, findRelevantTools, formatJobsContext } from "./run";
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
      run: workflow,
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

    expect(tools.map(tool => tool.name)).toContain("testService_someFunction");
    expect(tools.map(tool => tool.name)).not.toContain("testService_someOtherFunction");
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
  let run: Run;

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

    run = {
      id: Math.random().toString(36).substring(2),
      clusterId: owner.clusterId,
      status: "running",
    };
  });

  it("should return an empty object if no mocks are defined", async () => {
    const tools = await buildMockTools(run);
    expect(tools).toEqual({});
  });

  it("should return an empty object if test is not enabled", async () => {
    const tools = await buildMockTools({
      ...run,
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
      ...run,
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

describe("formatJobsContext", () => {
  it("should return empty string for empty jobs array", () => {
    const result = formatJobsContext([], "success");
    expect(result).toBe("");
  });

  it("should format successful jobs correctly", () => {
    const jobs = [
      {
        targetArgs: JSON.stringify({ param1: "test", param2: 123 }),
        result: JSON.stringify({ status: "ok", data: "result" }),
      },
      {
        targetArgs: JSON.stringify({ param3: true }),
        result: JSON.stringify({ status: "ok", count: 42 }),
      },
    ];

    const result = formatJobsContext(jobs, "success");

    // Verify structure and anonymization
    expect(result).toContain('<previous_jobs status="success">');
    expect(result).toContain("<input>");
    expect(result).toContain("<output>");
    expect(result).toContain('"param1":"<string>"');
    expect(result).toContain('"param2":"<number>"');
    expect(result).toContain('"param3":"<boolean>"');
    expect(result).toContain('"status":"<string>"');
    expect(result).toContain('"count":"<number>"');
  });

  it("should handle null results", () => {
    const jobs = [
      {
        targetArgs: JSON.stringify({ test: "value" }),
        result: null,
      },
    ];

    const result = formatJobsContext(jobs, "failed");

    expect(result).toContain('<previous_jobs status="failed">');
    expect(result).toContain("<input>");
    expect(result).toContain("<output>");
    expect(result).toContain('"test":"<string>"');
  });

  it("should anonymize arrays", () => {
    const result = formatJobsContext(
      [
        {
          targetArgs: JSON.stringify([1, 2, 3]),
          result: JSON.stringify([4, 5, 6]),
        },
      ],
      "success"
    );
    expect(result).toContain(`<input>[\"<number>\"]</input>`);
    expect(result).toContain(`<output>[\"<number>\"]</output>`);
  });

  it("should handle unparseable results", () => {
    const result = formatJobsContext(
      [
        {
          targetArgs: "this is not json",
          result: "this is not json",
        },
        {
          targetArgs: "<input>",
          result: "<output>",
        },
        {
          targetArgs: "123",
          result: "456",
        },
      ],
      "failed"
    );
    expect(result).toBe(
      `<previous_jobs status="failed">
<input>"<string>"</input><output>"<string>"</output>
<input>"<string>"</input><output>"<string>"</output>
<input>"<number>"</input><output>"<number>"</output>
</previous_jobs>`
    );
  });
});
