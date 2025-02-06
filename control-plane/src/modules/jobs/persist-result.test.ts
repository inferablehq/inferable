import { createOwner } from "../test/util";
import { createJobV2, getJobStatusSync, persistJobResult } from "./jobs";
import { acknowledgeJob } from "./job-results";
import * as redis from "../redis";
import { getClusterBackgroundRun } from "../runs";
import { upsertToolDefinition } from "../tools";

const mockTargetSchema = JSON.stringify({
  type: "object",
  properties: {
    test: {
      type: "string",
    },
  },
});

describe("persistJobResult", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;
  beforeAll(async () => {
    owner = await createOwner();
    await redis.start();
    await upsertToolDefinition({
      name: "testTargetFn",
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });

    await upsertToolDefinition({
      name: "machineStallTestFn",
      schema: mockTargetSchema,
      clusterId: owner.clusterId,
    });
  });

  afterAll(async () => {
    await redis.stop();
  });

  it("should persist the result of a job", async () => {
    const targetFn = "testTargetFn";
    const targetArgs = "testTargetArgs";

    const createJobResult = await createJobV2({
      targetFn,
      targetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    // last ping will be now
    const acknowledged = await acknowledgeJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    expect(acknowledged).toBeDefined();

    const count = await persistJobResult({
      result: "foo",
      resultType: "resolution",
      jobId: createJobResult.id,
      owner,
      machineId: "testMachineId",
    });

    expect(count).toBe(1);

    const status = await getJobStatusSync({
      jobId: createJobResult.id,
      owner,
    });

    expect(status).toStrictEqual({
      result: "foo",
      resultType: "resolution",
      status: "success",
    });
  });

  it("should only accept the machine that's assigned to the job", async () => {
    const targetFn = "machineStallTestFn";
    const targetArgs = "testTargetArgs";

    const createJobResult = await createJobV2({
      targetFn,
      targetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    // last ping will be now
    await acknowledgeJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    // persist job results from both machines

    await persistJobResult({
      result: "foo",
      resultType: "resolution",
      jobId: createJobResult.id,
      owner,
      machineId: "testMachineId",
    });

    await persistJobResult({
      result: "bar",
      resultType: "resolution",
      jobId: createJobResult.id,
      owner,
      machineId: "otherMachineId",
    });

    const status = await getJobStatusSync({
      jobId: createJobResult.id,
      owner,
    });

    expect(status).toStrictEqual({
      result: "foo",
      resultType: "resolution",
      status: "success",
    });
  });

  it("should not accept result for already resolved job", async () => {
    const targetFn = "machineStallTestFn";
    const targetArgs = "testTargetArgs";

    const createJobResult = await createJobV2({
      targetFn,
      targetArgs,
      owner,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    // last ping will be now
    await acknowledgeJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    // persist job results from both machines

    await persistJobResult({
      result: "foo",
      resultType: "resolution",
      jobId: createJobResult.id,
      owner,
      machineId: "testMachineId",
    });

    await persistJobResult({
      result: "bar",
      resultType: "resolution",
      jobId: createJobResult.id,
      owner,
      machineId: "testMachineId",
    });

    const status = await getJobStatusSync({
      jobId: createJobResult.id,
      owner,
    });

    expect(status).toStrictEqual({
      result: "foo",
      resultType: "resolution",
      status: "success",
    });
  });
});
