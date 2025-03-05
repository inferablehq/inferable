import { processAgentRun } from "./run";
import { createOwner } from "../../test/util";
import { ulid } from "ulid";
import { db, jobs, runs } from "../../data";
import { insertRunMessage } from "../messages";
import { and, eq } from "drizzle-orm";
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
      type: "multi-step" as const,
      attachedFunctions: ["someFunction"],
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
            toolName: "someFunction",
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

    await processAgentRun(run, undefined, mockModelResponses);

    // Find the Job in the DB
    const onStatusChangeJob = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.cluster_id, run.clusterId), eq(jobs.target_fn, "someOtherFunction")));

    expect(onStatusChangeJob.length).toBe(1);
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
