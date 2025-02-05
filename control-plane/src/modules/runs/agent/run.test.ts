import { formatJobsContext, processRun } from "./run";
import { createOwner } from "../../test/util";
import { ulid } from "ulid";
import { db, jobs, runs } from "../../data";
import { insertRunMessage } from "../messages";
import { and, eq } from "drizzle-orm";
import { findRelevantTools } from "./tool-search";
import { upsertToolDefinition } from "../../tools";

describe("processRun", () => {
  it("should call onStatusChange function handler", async () => {
    const owner = await createOwner();
    await upsertToolDefinition({
      name: "someFunction",
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });

    await upsertToolDefinition({
      name: "someOtherFunction",
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });

    const run = {
      id: Math.random().toString(36).substring(2),
      clusterId: owner.clusterId,
      status: "running" as const,
      attachedFunctions: ["testService_someFunction"],
      modelIdentifier: null,
      onStatusChange: {
        type: "function" as const,
        statuses: ["running", "pending", "paused", "done", "failed"] as any,
        function: {
          service: "testService",
          function: "someOtherFunction",
        },
      },
      resultSchema: {
        type: "object",
        properties: {
          word: {
            type: "string",
          },
        },
      },
      debug: false,
      systemPrompt: null,
      testMocks: {
        testService_someFunction: {
          output: {
            test: "test",
          },
        },
      },
      test: true,
      reasoningTraces: false,
      enableResultGrounding: false,
      authContext: null,
      context: null,
    };

    await db.insert(runs).values({
      id: run.id,
      cluster_id: run.clusterId,
      user_id: "1",
    });

    await insertRunMessage({
      id: ulid(),
      runId: run.id,
      clusterId: run.clusterId,
      type: "human",
      data: {
        message: "Call someFunction",
      },
    });

    const mockModelResponses = [
      JSON.stringify({
        done: false,
        invocations: [
          {
            toolName: "testService_someFunction",
            input: {},
          },
        ],
      }),
      JSON.stringify({
        done: true,
        result: {
          word: "needle",
        },
      }),
    ];

    await processRun(run, undefined, mockModelResponses);

    // Find the Job in the DB
    const onStatusChangeJob = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.cluster_id, run.clusterId), eq(jobs.target_fn, "someOtherFunction")));

    expect(onStatusChangeJob.length).toBe(1);
  });
});

describe("findRelevantTools", () => {
  it("should return explicitly attached tools", async () => {
    const owner = await createOwner();

    await upsertToolDefinition({
      name: "someFunction",
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });

    await upsertToolDefinition({
      name: "someOtherFunction",
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });

    const run = {
      id: Math.random().toString(36).substring(2),
      clusterId: owner.clusterId,
      status: "running" as const,
      attachedFunctions: ["testService_someFunction"],
      modelIdentifier: null,
      resultSchema: null,
      debug: false,
      systemPrompt: null,
      testMocks: {},
      test: false,
      reasoningTraces: false,
      enableResultGrounding: false,
    };

    const tools = await findRelevantTools({
      run,
      messages: [
        {
          data: {
            message: "Call someFunction",
          },
          type: "human" as const,
          clusterId: owner.clusterId,
          runId: "test-run-id",
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
