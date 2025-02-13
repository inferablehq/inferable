import * as jobs from "../jobs/jobs";
import { createOwner } from "../test/util";
import { getClusterBackgroundRun } from "../runs";
import * as events from "./events";
import { upsertToolDefinition } from "../tools";

const mockTargetSchema = JSON.stringify({
  type: "object",
  properties: {
    test: {
      type: "string",
    },
  },
});

describe("event-aggregation", () => {
  const clusterId = Math.random().toString();

  const simulateActivity = async () => {
    await createOwner({
      clusterId,
    });

    await upsertToolDefinition({
      name: "fn1",
      schema: mockTargetSchema,
      clusterId,
    });

    await upsertToolDefinition({
      name: "fn2",
      schema: mockTargetSchema,
      clusterId,
    });

    const mockJobs = [
      {
        targetFn: "fn1",
        targetArgs: "args",
        resultType: "resolution",
        result: "woof",
      },
      {
        targetFn: "fn1",
        targetArgs: "args",
        resultType: "resolution",
        result: "woof",
      },
      {
        targetFn: "fn1",
        targetArgs: "args",
        resultType: "rejection",
        result: "meow",
      },
      {
        targetFn: "fn2",
        targetArgs: "args",
        resultType: "resolution",
        result: "woof",
      },
      {
        targetFn: "fn2",
        targetArgs: "args",
        resultType: "rejection",
        result: "woof",
      },
      {
        targetFn: "fn2",
        targetArgs: "args",
        resultType: "rejection",
        result: "meow",
      },
    ] as const;

    const jobIds = await Promise.all(
      mockJobs.map(async ({ targetFn, targetArgs, result, resultType }, i) => {
        const job = await jobs.createJobV2({
          owner: {
            clusterId,
          },
          targetFn,
          targetArgs,
          runId: getClusterBackgroundRun(clusterId),
        });

        // wait 100ms
        await new Promise(resolve => setTimeout(resolve, 100));

        await jobs.acknowledgeJob({
          jobId: job.id,
          clusterId,
          machineId: "machine1",
        });

        // wait 100ms
        await new Promise(resolve => setTimeout(resolve, 100));

        await jobs.persistJobResult({
          jobId: job.id,
          machineId: "machine1",
          resultType,
          result,
          functionExecutionTime: 100 * i,
          owner: {
            clusterId,
          },
        });

        return job.id;
      })
    );

    return { jobIds };
  };

  beforeAll(async () => {
    events.initialize();
  });

  it("should return the correct metrics", async () => {
    const { jobIds } = await simulateActivity();

    await events.buffer?.flush();

    for (const jobId of jobIds) {
      const activity = await events
        .getEventsByClusterId({
          clusterId,
          filters: {
            jobId,
          },
        })
        .then(a => a.reverse());

      expect(activity[0].type).toEqual("jobCreated");
      expect(activity[1].type).toEqual("jobAcknowledged");
      expect(activity[activity.length - 1].type).toEqual("functionResulted");
    }
  });
});
