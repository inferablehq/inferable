import * as jobs from "../jobs/jobs";
import { createOwner } from "../test/util";
import * as events from "./events";

jest.mock("../service-definitions", () => ({
  ...jest.requireActual("../service-definitions"),
  parseJobArgs: jest.fn(),
}));

describe("event-aggregation", () => {
  const clusterId = Math.random().toString();
  const service = "testService";

  const simulateActivity = async () => {
    await createOwner({
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
        const job = await jobs.createJob({
          owner: {
            clusterId,
          },
          service,
          targetFn,
          targetArgs,
        });

        // wait 100ms
        await new Promise((resolve) => setTimeout(resolve, 100));

        await jobs.acknowledgeJob({
          jobId: job.id,
          clusterId,
          machineId: "machine1",
        });

        // wait 100ms
        await new Promise((resolve) => setTimeout(resolve, 100));

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
      }),
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
        .getActivityByClusterId({
          clusterId,
          filters: {
            jobId,
          },
        })
        .then((a) => a.reverse());

      expect(activity[0].type).toEqual("jobCreated");
      expect(activity[1].type).toEqual("jobAcknowledged");
      expect(activity[activity.length - 1].type).toEqual("jobResulted");
    }
  });
});
