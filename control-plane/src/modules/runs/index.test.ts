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
        runId: run.id,
        clusterId: owner.clusterId,
      })
    ).resolves.not.toThrow();
  });

  it("should be idempotent when creating run with same ID", async () => {
    const id = ulid();
    const firstRun = await createRun({
      id,
      clusterId: owner.clusterId,
      name: "first run",
      tags: {
        first: "first",
      },
      systemPrompt: "foo",
    });

    const secondRun = await createRun({
      id,
      clusterId: owner.clusterId,
      name: "second run",
      tags: {
        second: "second",
      },
      systemPrompt: "bar",
    });

    expect(secondRun.name).toEqual(firstRun.name);
    expect(firstRun.id).toBe(id);
  });

  it("should throw if run is running", async () => {
    const run = await createRun({
      clusterId: owner.clusterId,
    });

    const updatedRun = await updateRun({
      ...run,
      status: "running",
    });

    await expect(
      assertRunReady({
        runId: updatedRun.id,
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
        runId: run.id,
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

    const updatedRun = await updateRun({
      ...run,
      status: "done",
    });

    await expect(
      assertRunReady({
        runId: updatedRun.id,
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

    const updatedRun = await updateRun({
      ...run,
      status: "done",
    });

    await expect(
      assertRunReady({
        runId: updatedRun.id,
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
        runId: updatedRun.id,
        clusterId: owner.clusterId,
      })
    ).rejects.toThrow(RunBusyError);
  });
});
