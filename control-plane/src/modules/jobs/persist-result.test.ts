import { upsertMachine } from "../machines";
import { upsertServiceDefinition } from "../service-definitions";
import { createOwner } from "../test/util";
import { createJob, getJobStatusSync, persistJobResult } from "./jobs";
import { acknowledgeJob, selfHealJobs } from "./persist-result";
import * as redis from "../redis";
import { getClusterBackgroundRun } from "../workflows/workflows";

jest.mock("../service-definitions", () => ({
  ...jest.requireActual("../service-definitions"),
  parseJobArgs: jest.fn(),
}));

describe("persistJobResult", () => {
  beforeAll(async () => {
    await redis.start();
  });

  afterAll(async () => {
    await redis.stop();
  });

  it("should persist the result of a job", async () => {
    const owner = await createOwner();
    const targetFn = "testTargetFn";
    const targetArgs = "testTargetArgs";

    const createJobResult = await createJob({
      targetFn,
      targetArgs,
      owner,
      service: "testService",
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
      service: "testService",
      status: "success",
    });
  });

  it("should auto retry when a machine is stalled", async () => {
    const owner = await createOwner();
    const targetFn = "machineStallTestFn";
    const targetArgs = "testTargetArgs";
    const service = "testService";

    await upsertServiceDefinition({
      service: "testService",
      definition: {
        name: service,
        functions: [
          {
            name: targetFn,
            config: {
              retryCountOnStall: 1,
            },
          },
        ],
      },
      owner,
    });

    const createJobResult = await createJob({
      targetFn,
      targetArgs,
      owner,
      service,
      runId: getClusterBackgroundRun(owner.clusterId),
    });

    await upsertMachine({
      clusterId: owner.clusterId,
      machineId: "testMachineId",
      sdkVersion: "1.0.0",
      sdkLanguage: "typescript",
      ip: "1.1.1.1",
    });

    // last ping will be now
    await acknowledgeJob({
      jobId: createJobResult.id,
      clusterId: owner.clusterId,
      machineId: "testMachineId",
    });

    const machineStallTimeout = 1;

    // wait 1s for the machine to stall
    await new Promise(resolve => setTimeout(resolve, machineStallTimeout * 1000));

    // self heal jobs with machine stall timeout of 1s
    const healedJobs = await selfHealJobs({ machineStallTimeout });

    expect(
      healedJobs.stalledMachines.some(
        x => x.id === "testMachineId" && x.clusterId === owner.clusterId
      )
    ).toBe(true);
    expect(healedJobs.stalledRecovered).toContain(createJobResult.id);
  });

  it("should only accept the machine that's assigned to the job", async () => {
    const owner = await createOwner();
    const targetFn = "machineStallTestFn";
    const targetArgs = "testTargetArgs";
    const service = "testService";

    const createJobResult = await createJob({
      targetFn,
      targetArgs,
      owner,
      service,
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
      service,
      status: "success",
    });
  });

  it("should not accept result for already resolved job", async () => {
    const owner = await createOwner();
    const targetFn = "machineStallTestFn";
    const targetArgs = "testTargetArgs";
    const service = "testService";

    const createJobResult = await createJob({
      targetFn,
      targetArgs,
      owner,
      service,
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
      service,
      status: "success",
    });
  });
});
