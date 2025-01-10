import { BadRequestError, RunBusyError } from "../../utilities/errors";
import { createOwner } from "../test/util";
import { insertRunMessage } from "./messages";
import { assertRunReady, createRun, updateRun } from "./";
import { ulid } from "ulid";

describe("assertRunReady", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;

  beforeAll(async () => {
    owner = await createOwner();
  });
  it("should succeed if run is ready", async () => {
    const run = await createRun({
      clusterId: owner.clusterId,
    });

    await expect(
      assertRunReady({
        run,
        clusterId: owner.clusterId,
      })
    ).resolves.not.toThrow();
  });

  it("should throw if run is running", async () => {
    const run = await createRun({
      clusterId: owner.clusterId,
    });

    await updateRun({
      ...run,
      status: "running",
    });

    await expect(
      assertRunReady({
        run,
        clusterId: owner.clusterId,
      })
    ).rejects.toThrow(RunBusyError);
  });

  it("should throw if run is not interactive", async () => {
    const run = await createRun({
      clusterId: owner.clusterId,
      interactive: false,
    });

    await expect(
      assertRunReady({
        run,
        clusterId: owner.clusterId,
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("should pass if last message is AI", async () => {
    const run = await createRun({
      clusterId: owner.clusterId,
    });

    await insertRunMessage({
      id: ulid(),
      data: {
        message: "Some request",
      },
      type: "human",
      clusterId: owner.clusterId,
      runId: run.id,
    });

    await insertRunMessage({
      id: ulid(),
      data: {
        message: "Some response",
      },
      type: "agent",
      clusterId: owner.clusterId,
      runId: run.id,
    });

    await updateRun({
      ...run,
      status: "done",
    });

    await expect(
      assertRunReady({
        run,
        clusterId: owner.clusterId,
      })
    ).resolves.not.toThrow();
  });

  it.each(["human", "template"] as const)("should throw if last message is %s", async type => {
    const run = await createRun({
      clusterId: owner.clusterId,
    });

    await insertRunMessage({
      id: ulid(),
      data: {
        message: "Some request",
      },
      type,
      clusterId: owner.clusterId,
      runId: run.id,
    });

    await updateRun({
      ...run,
      status: "done",
    });

    await expect(
      assertRunReady({
        run,
        clusterId: owner.clusterId,
      })
    ).rejects.toThrow(RunBusyError);
  });

  it.each([
    {
      data: {
        invocations: [
          {
            id: "some-id",
            input: { input: "hello" },
            reasoning: "User requested",
            toolName: "console_echo",
          },
        ],
      },
      type: "agent" as const,
    },
    {
      data: {
        id: "some-id",
        result: {
          data: "some tool message",
        },
      },
      type: "invocation-result" as const,
    },
    {
      data: {
        message: "some system tempalte message",
      },
      type: "template" as const,
    },
  ])("messages should throw unless AI with no tool calls", async message => {
    const run = await createRun({
      clusterId: owner.clusterId,
    });

    await insertRunMessage({
      id: ulid(),
      data: {
        message: "Some request",
      },
      type: "human",
      clusterId: owner.clusterId,
      runId: run.id,
    });

    await insertRunMessage({
      id: ulid(),
      data: {
        message: "Some response",
      },
      type: "agent",
      clusterId: owner.clusterId,
      runId: run.id,
    });

    await insertRunMessage({
      ...message,
      id: ulid(),
      runId: run.id,
      clusterId: owner.clusterId,
    });

    const updatedRun = await updateRun({
      id: run.id,
      clusterId: owner.clusterId,
      status: "done",
    });

    await expect(
      assertRunReady({
        run: {
          id: updatedRun.id,
          status: updatedRun.status,
          interactive: updatedRun.interactive,
          clusterId: owner.clusterId,
        },
        clusterId: owner.clusterId,
      })
    ).rejects.toThrow(RunBusyError);
  });
});
