import { ulid } from "ulid";
import { packer } from "../../utilities/packer";
import { createOwner } from "../test/util";
import {
  createJobV2,
  pollJobsByTools,
  getJob,
  requestApproval,
  submitApproval,
} from "./jobs";
import { acknowledgeJob, persistJobResult } from "./job-results";
import { selfHealJobs } from "./self-heal-jobs";
import * as redis from "../dependencies/redis";
import { getClusterBackgroundRun } from "../runs";
import { upsertToolDefinition } from "../tools";
import { sql, and, eq } from "drizzle-orm";
import * as data from "../data";

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

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });

    const result = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    expect(result.id).toBeDefined();
    expect(result.created).toBe(true);
  });
});

describe("selfHealCalls", () => {
  beforeAll(async () => {
    await redis.start();
  });

  afterAll(async () => {
    await redis.stop();
  });

  it("should mark a job for retries, once it has timed out", async () => {
    const owner = await createOwner();

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      config: {
        retryCountOnStall: 1,
        timeoutSeconds: 1,
      },
      clusterId: owner.clusterId,
    });

    const createJobResult = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
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
    await new Promise(resolve => setTimeout(resolve, 2000));

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

  it("should recover a hanging interrupt job", async () => {
    const owner = await createOwner();

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      config: {
        retryCountOnStall: 1,
        timeoutSeconds: 1,
      },
      clusterId: owner.clusterId,
    });

    const createJobResult = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
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

    // Mark the job as interrupted 10 minutes ago
    await data.db
      .update(data.jobs)
      .set({
        status: "interrupted",
        updated_at: sql`now() - interval '10 minutes'`,
      })
      .where(
        and(
          eq(data.jobs.id, createJobResult.id),
          eq(data.jobs.cluster_id, owner.clusterId),
        ),
      )
      .returning({
        targetFn: data.jobs.target_fn,
        targetArgs: data.jobs.target_args,
      });

    // run the self heal job
    const healedJobs = await selfHealJobs();

    expect(healedJobs.stalledFailedByTimeout).not.toContain(createJobResult.id);

    expect(healedJobs.nonResumedInterruptions).toContain(createJobResult.id);
    expect(healedJobs.stalledRecovered).toContain(createJobResult.id);

    // query the next job, it should be good to go
    const job = await getJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
    });

    expect(job!.status).toBe("pending");
  });

  it("should not recover a hanging interrupt job from 2 days ago", async () => {
    const owner = await createOwner();

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      config: {
        retryCountOnStall: 1,
        timeoutSeconds: 1,
      },
      clusterId: owner.clusterId,
    });

    const createJobResult = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
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

    // Mark the job as interrupted 10 minutes ago
    await data.db
      .update(data.jobs)
      .set({
        status: "interrupted",
        updated_at: sql`now() - interval '2 days'`,
      })
      .where(
        and(
          eq(data.jobs.id, createJobResult.id),
          eq(data.jobs.cluster_id, owner.clusterId),
        ),
      )
      .returning({
        targetFn: data.jobs.target_fn,
        targetArgs: data.jobs.target_args,
      });

    // run the self heal job
    const healedJobs = await selfHealJobs();

    expect(healedJobs.stalledFailedByTimeout).not.toContain(createJobResult.id);

    expect(healedJobs.nonResumedInterruptions).not.toContain(
      createJobResult.id,
    );
    expect(healedJobs.stalledRecovered).not.toContain(createJobResult.id);

    const job = await getJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
    });

    expect(job!.status).toBe("interrupted");
  });

  it("should not stall a job waiting for approval", async () => {
    const owner = await createOwner();

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      config: {
        timeoutSeconds: 1,
      },
      clusterId: owner.clusterId,
    });

    const createJobResult = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    expect(createJobResult.id).toBeDefined();
    expect(createJobResult.created).toBe(true);

    await acknowledgeJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    await requestApproval({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    // wait for the job to timeout
    await new Promise(resolve => setTimeout(resolve, 2000));

    // run the self heal job
    const healedJobs = await selfHealJobs();

    expect(healedJobs.stalledFailedByTimeout).not.toContain(createJobResult.id);
    expect(healedJobs.stalledRecovered).not.toContain(createJobResult.id);

    // query the next job, it should be good to go
    const job = await getJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
    });

    expect(job!.status).toBe("interrupted");
  });

  it("should not retry a job that has reached max attempts", async () => {
    const owner = await createOwner();

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      config: {
        timeoutSeconds: 1,
        retryCountOnStall: 0,
      },
      clusterId: owner.clusterId,
    });

    const createJobResult = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    // acknowledge the job, so that it moves to running state
    const acknowledged = await acknowledgeJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    expect(acknowledged).toBeDefined();

    // wait for the job to timeout
    await new Promise(resolve => setTimeout(resolve, 2000));

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

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });

    const toolCallId = ulid();
    const createJobResult1 = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      jobId: toolCallId,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    expect(createJobResult1.id).toBeDefined();
    expect(createJobResult1.created).toBe(true);

    const createJobResult2 = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      jobId: toolCallId,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    expect(createJobResult2.id).toBe(createJobResult1.id);
    expect(createJobResult2.created).toBe(false);
  });

  it("should not create a job with cached result", async () => {
    const owner = await createOwner();

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      config: {
        cache: {
          keyPath: "$.test",
          ttlSeconds: 10,
        },
      },
      clusterId: owner.clusterId,
    });

    const createJobResult1 = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
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

    const createJobResult2 = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    expect(createJobResult2.id).toBe(createJobResult1.id);
    expect(createJobResult2.created).toBe(false);
  });
});

describe("pollJobs", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;
  const machineId = "testMachineId";

  beforeAll(async () => {
    owner = await createOwner();

    await redis.start();

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });
  });

  afterAll(async () => {
    await redis.stop();
  });

  it("should acknlowledge polled jobs", async () => {
    const job1 = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    const result = await pollJobsByTools({
      clusterId: owner.clusterId,
      limit: 10,
      machineId,
      tools: [mockTargetFn],
    });

    expect(result.length).toBe(1);
    expect(result[0].id).toBe(job1.id);

    const result2 = await pollJobsByTools({
      clusterId: owner.clusterId,
      limit: 10,
      machineId,
      tools: [mockTargetFn],
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
    await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    const poll = () =>
      pollJobsByTools({
        clusterId: owner.clusterId,
        limit: 10,
        machineId: `testMachineId-${Math.random()}`,
        tools: [mockTargetFn],
      });

    const results = await Promise.all([
      ...Array(50)
        .fill(0)
        .map(async () => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          return poll();
        }),
    ]);

    expect(results.flat().length).toBe(1);

    const result = await poll();
    expect(result.length).toBe(0);
  });
});

describe("submitApproval", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;
  beforeAll(async () => {
    owner = await createOwner();

    await upsertToolDefinition({
      name: mockTargetFn,
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });
  });
  it("should mark job as approved", async () => {
    const result = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    expect(result.id).toBeDefined();
    expect(result.created).toBe(true);

    await acknowledgeJob({
      jobId: result.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    await requestApproval({
      clusterId: owner.clusterId,
      jobId: result.id,
      machineId: "testMachineId",
    });

    const retreivedJob1 = await getJob({
      jobId: result.id,
      clusterId: owner.clusterId,
    });

    expect(retreivedJob1!.approvalRequested).toBe(true);

    await submitApproval({
      clusterId: owner.clusterId,
      jobId: retreivedJob1!.id,
      approved: true,
    });

    const retreivedJob2 = await getJob({
      jobId: result.id,
      clusterId: owner.clusterId,
    });

    expect(retreivedJob2!.approved).toBe(true);
    expect(retreivedJob2!.status).toBe("pending");
    expect(retreivedJob2!.resultType).toBe(null);

    // Re-submitting approval should be a no-op
    await submitApproval({
      clusterId: owner.clusterId,
      jobId: retreivedJob1!.id,
      approved: false,
    });

    const retreivedJob3 = await getJob({
      jobId: result.id,
      clusterId: owner.clusterId,
    });

    expect(retreivedJob3!.approved).toBe(true);
    expect(retreivedJob3!.status).toBe("pending");
    expect(retreivedJob3!.resultType).toBe(null);
  });

  it("should mark job as denied", async () => {
    const result = await createJobV2({
      targetFn: mockTargetFn,
      targetArgs: mockTargetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    expect(result.id).toBeDefined();
    expect(result.created).toBe(true);

    await acknowledgeJob({
      jobId: result.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    await requestApproval({
      clusterId: owner.clusterId,
      jobId: result.id,
      machineId: "testMachineId",
    });

    const retreivedJob1 = await getJob({
      jobId: result.id,
      clusterId: owner.clusterId,
    });

    expect(retreivedJob1!.approvalRequested).toBe(true);

    await submitApproval({
      clusterId: owner.clusterId,
      jobId: retreivedJob1!.id,
      approved: false,
    });

    const retreivedJob2 = await getJob({
      jobId: result.id,
      clusterId: owner.clusterId,
    });

    expect(retreivedJob2!.approved).toBe(false);
    expect(retreivedJob2!.status).toBe("success");
    expect(retreivedJob2!.resultType).toBe("rejection");

    // Re-submitting approval should be a no-op
    await submitApproval({
      clusterId: owner.clusterId,
      jobId: retreivedJob1!.id,
      approved: true,
    });

    const retreivedJob3 = await getJob({
      jobId: result.id,
      clusterId: owner.clusterId,
    });

    expect(retreivedJob3!.approved).toBe(false);
    expect(retreivedJob3!.status).toBe("success");
    expect(retreivedJob3!.resultType).toBe("rejection");
  });
});
