import { ulid } from "ulid";
import { packer } from "../packer";
import { upsertServiceDefinition } from "../service-definitions";
import { createOwner } from "../test/util";
import { createJob, pollJobs, getJob, requestApproval } from "./jobs";
import {
  acknowledgeJob,
  persistJobResult,
  selfHealJobs,
} from "./persist-result";
import * as redis from "../redis";

const mockTargetFn = "testTargetFn";
const mockTargetArgs = packer.pack({ test: "test" });

const mockTargetSchema = JSON.stringify({
  type: "object",
  properties: {
    test: {
      type: "string",
    },
  },
});

describe("createJob", () => {
  it("should create a job", async () => {
    const owner = await createOwner();

    await upsertServiceDefinition({
      service: "testService",
      definition: {
        name: "testService",
        functions: [
          {
            name: mockTargetFn,
            schema: mockTargetSchema,
          },
        ],
      },
      owner,
    });

    const result = await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service: "testService",
    });

    expect(result.id).toBeDefined();
    expect(result.created).toBe(true);
  });
});

describe("selfHealJobs", () => {
  beforeAll(async () => {
    await redis.start();
  });

  afterAll(async () => {
    await redis.stop();
  });

  it("should mark a job for retries, once it has timed out", async () => {
    const owner = await createOwner();

    await upsertServiceDefinition({
      service: "testService",
      definition: {
        name: "testService",
        functions: [
          {
            name: mockTargetFn,
            schema: mockTargetSchema,
            config: {
              retryCountOnStall: 1,
              timeoutSeconds: 1,
            },
          },
        ],
      },
      owner,
    });

    const createJobResult = await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service: "testService",
    });

    expect(createJobResult.id).toBeDefined();
    expect(createJobResult.created).toBe(true);

    // acknowledge the job, so that it moves to running state
    const acknowledged = await acknowledgeJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    expect(acknowledged).toBeDefined();

    // wait for the job to timeout
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // run the self heal job
    const healedJobs = await selfHealJobs();

    expect(healedJobs.stalledFailedByTimeout).toContain(createJobResult.id);
    expect(healedJobs.stalledRecovered).toContain(createJobResult.id);

    // query the next job, it should be good to go
    const job = await getJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
    });

    expect(job!.status).toBe("pending");
  });

  it("should not stall a job waiting for approval", async () => {
    const owner = await createOwner();

    await upsertServiceDefinition({
      service: "testService",
      definition: {
        name: "testService",
        functions: [
          {
            name: mockTargetFn,
            schema: mockTargetSchema,
            config: {
              timeoutSeconds: 1,
            },
          },
        ],
      },
      owner,
    });

    const createJobResult = await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service: "testService",
    });

    expect(createJobResult.id).toBeDefined();
    expect(createJobResult.created).toBe(true);

    await requestApproval({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
    });

    // wait for the job to timeout
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // run the self heal job
    const healedJobs = await selfHealJobs();

    expect(healedJobs.stalledFailedByTimeout).not.toContain(createJobResult.id);
    expect(healedJobs.stalledRecovered).not.toContain(createJobResult.id);

    // query the next job, it should be good to go
    const job = await getJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
    });

    expect(job!.status).toBe("pending");
  });

  it("should not retry a job that has reached max attempts", async () => {
    const owner = await createOwner();

    await upsertServiceDefinition({
      service: "testService",
      definition: {
        name: "testService",
        functions: [
          {
            name: mockTargetFn,
            schema: mockTargetSchema,
            config: {
              retryCountOnStall: 0,
              timeoutSeconds: 1,
            },
          },
        ],
      },
      owner,
    });

    const createJobResult = await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service: "testService",
    });

    // acknowledge the job, so that it moves to running state
    const acknowledged = await acknowledgeJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    expect(acknowledged).toBeDefined();

    // wait for the job to timeout
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // run the self heal job
    const healedJobs = await selfHealJobs();

    expect(healedJobs.stalledFailedByTimeout).toContain(createJobResult.id);
    expect(healedJobs.stalledRecovered).not.toContain(createJobResult.id);

    const job = await getJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
    });

    expect(job!.status).toBe("failure");
  });

  it("should not create a job with the same id", async () => {
    const owner = await createOwner();

    await upsertServiceDefinition({
      service: "testService",
      definition: {
        name: "testService",
        functions: [
          {
            name: mockTargetFn,
            schema: mockTargetSchema,
          },
        ],
      },
      owner,
    });

    const toolCallId = ulid();
    const createJobResult1 = await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service: "testService",
      toolCallId,
    });

    expect(createJobResult1.id).toBeDefined();
    expect(createJobResult1.created).toBe(true);

    const createJobResult2 = await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service: "testService",
      toolCallId,
    });

    expect(createJobResult2.id).toBe(createJobResult1.id);
    expect(createJobResult2.created).toBe(false);
  });

  it("should not create a job with cached result", async () => {
    const owner = await createOwner();

    await upsertServiceDefinition({
      service: "testService",
      definition: {
        name: "testService",
        functions: [
          {
            name: mockTargetFn,
            schema: mockTargetSchema,
            config: {
              cache: {
                keyPath: "$.test",
                ttlSeconds: 10,
              },
            },
          },
        ],
      },
      owner,
    });

    const createJobResult1 = await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service: "testService",
    });

    await acknowledgeJob({
      jobId: createJobResult1.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    await persistJobResult({
      result: "success",
      resultType: "resolution",
      jobId: createJobResult1.id,
      machineId: "testMachineId",
      owner,
    });

    expect(createJobResult1.id).toBeDefined();
    expect(createJobResult1.created).toBe(true);

    const createJobResult2 = await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service: "testService",
    });

    expect(createJobResult2.id).toBe(createJobResult1.id);
    expect(createJobResult2.created).toBe(false);
  });
});

describe("pollJobs", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;
  const machineId = "testMachineId";
  const service = "testService";

  beforeAll(async () => {
    owner = await createOwner();

    await redis.start();

    await upsertServiceDefinition({
      service,
      definition: {
        name: service,
        functions: [
          {
            name: mockTargetFn,
            schema: mockTargetSchema,
          },
        ],
      },
      owner,
    });
  });

  afterAll(async () => {
    await redis.stop();
  });

  it("should acknlowledge polled jobs", async () => {
    const job1 = await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service,
    });

    const result = await pollJobs({
      clusterId: owner.clusterId,
      limit: 10,
      machineId,
      service,
    });

    expect(result.length).toBe(1);
    expect(result[0].id).toBe(job1.id);

    const result2 = await pollJobs({
      clusterId: owner.clusterId,
      limit: 10,
      machineId,
      service,
    });

    expect(result2.length).toBe(0);

    const retreivedJob1 = await getJob({
      jobId: job1.id,
      clusterId: owner.clusterId,
    });

    expect(retreivedJob1!.status).toBe("running");
    expect(retreivedJob1!.executingMachineId).toBe(machineId);
  });

  it("should only relase job once", async () => {
    await createJob({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      service,
    });

    const poll = () =>
      pollJobs({
        clusterId: owner.clusterId,
        limit: 10,
        machineId: `testMachineId-${Math.random()}`,
        service,
      });

    const results = await Promise.all([
      ...Array(50)
        .fill(0)
        .map(async () => {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 10),
          );
          return poll();
        }),
    ]);

    expect(results.flat().length).toBe(1);

    const result = await poll();
    expect(result.length).toBe(0);
  });
});
