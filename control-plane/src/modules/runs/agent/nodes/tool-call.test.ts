import { handleToolCalls } from "./tool-call";
import { z } from "zod";
import { SpecialResultTypes } from "../tools/functions";
import { NotFoundError } from "../../../../utilities/errors";
import { ulid } from "ulid";
import { RunGraphState } from "../state";
import { redisClient } from "../../../dependencies/redis";
import { AgentTool } from "../tool";
import { assertMessageOfType } from "../../messages";

describe("handleToolCalls", () => {
  const run = {
    id: "test",
    clusterId: "test",
    resultSchema: null,
    debug: false,
    attachedFunctions: null,
    status: "running",
    systemPrompt: null,
    testMocks: {},
    test: false,
    reasoningTraces: false,
    enableResultGrounding: false,
  };

  const toolHandler = jest.fn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tool = new AgentTool({
    description: "Echoes the input",
    func: toolHandler,
    name: "console_echo",
    schema: z.object({
      input: z.string(),
    }),
  });

  const messages = [
    {
      id: ulid(),
      type: "agent" as const,
      data: {
        invocations: [
          {
            id: "123",
            toolName: "console_echo",
            reasoning: "User requested",
            input: {
              input: "hello",
            },
          },
        ],
      },
      runId: run.id,
      clusterId: run.clusterId,
    },
  ];

  const baseState: RunGraphState = {
    messages,
    run: run,
    status: "running",
    waitingJobs: [],
  };

  beforeAll(async () => {
    // Ensure Redis client is connected
    await redisClient?.connect();
  });

  afterAll(async () => {
    // Close Redis connection after all tests
    await redisClient?.quit();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clear all keys in Redis before each test
    await redisClient?.flushAll();
  });

  it("should call a tool", async () => {
    const stateUpdate = await handleToolCalls(baseState, async () => tool);

    expect(toolHandler).toHaveBeenCalledTimes(1);

    expect(stateUpdate).toHaveProperty("status", "running");
    expect(stateUpdate).toHaveProperty("waitingJobs", []);
    expect(stateUpdate).toHaveProperty("result", undefined);
    expect(stateUpdate).toHaveProperty("messages");
    expect(stateUpdate.messages).toHaveLength(1);
  });

  it("should detect job timeouts", async () => {
    const waitingJobId = "123";

    toolHandler.mockResolvedValueOnce(
      JSON.stringify({
        result: JSON.stringify([waitingJobId]),
        resultType: SpecialResultTypes.jobTimeout,
        status: "success",
      }),
    );
    const stateUpdate = await handleToolCalls(baseState, async () => tool);

    expect(toolHandler).toHaveBeenCalledTimes(1);

    expect(stateUpdate).toHaveProperty("status", "paused");
    expect(stateUpdate).toHaveProperty("waitingJobs", [waitingJobId]);
    expect(stateUpdate).toHaveProperty("result", undefined);
    expect(stateUpdate).toHaveProperty("messages");
    expect(stateUpdate.messages).toHaveLength(0);
  });

  it("should report missing tools", async () => {
    const stateUpdate = await handleToolCalls(baseState, async () => {
      throw new NotFoundError("Tool not found");
    });

    expect(toolHandler).toHaveBeenCalledTimes(0);

    expect(stateUpdate).toHaveProperty("status", "running");
    expect(stateUpdate).toHaveProperty("waitingJobs", []);
    expect(stateUpdate).toHaveProperty("result", undefined);
    expect(stateUpdate).toHaveProperty("messages");
    expect(stateUpdate.messages).toHaveLength(1);

    expect(stateUpdate.messages![0]).toHaveProperty(
      "type",
      "invocation-result",
    );

    assertMessageOfType("invocation-result", stateUpdate.messages![0]!);

    expect(stateUpdate.messages![0]!.data as any).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          message: expect.stringContaining(`Failed to find tool: console_echo`),
        }),
      }),
    );
  });

  it("should report invalid tool input", async () => {
    const messages = [
      {
        id: ulid(),
        type: "agent" as const,
        message: "",
        data: {
          invocations: [
            {
              id: "123",
              toolName: "console_echo",
              reasoning: "User requested",
              input: {
                wrongKey: "something",
              },
            },
          ],
        },
        runId: run.id,
        clusterId: run.clusterId,
      },
    ];

    const stateUpdate = await handleToolCalls(
      {
        ...baseState,
        messages,
      },
      async () => tool,
    );

    expect(toolHandler).toHaveBeenCalledTimes(0);

    expect(stateUpdate).toHaveProperty("status", "running");
    expect(stateUpdate).toHaveProperty("waitingJobs", []);
    expect(stateUpdate).toHaveProperty("result", undefined);
    expect(stateUpdate).toHaveProperty("messages");

    expect(stateUpdate.messages).toHaveLength(1);

    expect(stateUpdate.messages![0]).toHaveProperty(
      "type",
      "invocation-result",
    );
    assertMessageOfType("invocation-result", stateUpdate.messages![0]!);

    expect((stateUpdate.messages![0].data as any).result).toEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          `Provided input did not match schema for ${tool.name}`,
        ),
        parseResult: expect.arrayContaining([
          expect.objectContaining({
            message:
              'is not allowed to have the additional property "wrongKey"',
          }),
        ]),
      }),
    );
  });

  describe("parallel tool calls", () => {
    it("should handle parallel tool calls", async () => {
      // Two tool calls, one of which has resolved already
      const messages = [
        {
          id: ulid(),
          type: "agent" as const,
          message: "",
          data: {
            invocations: [
              {
                id: "123",
                toolName: "console_echo",
                reasoning: "User requested",
                input: {
                  input: "hello",
                },
              },
              {
                id: "456",
                toolName: "console_echo",
                reasoning: "User requested",
                input: {
                  input: "world",
                },
              },
            ],
          },
          runId: run.id,
          clusterId: run.clusterId,
        },
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            id: "456",
            toolName: "console_echo",
            resultType: "resolution" as const,
            result: { output: "world" },
          },
          runId: run.id,
          clusterId: run.clusterId,
        },
      ];

      const stateUpdate = await handleToolCalls(
        {
          ...baseState,
          messages,
        },
        async () => tool,
      );

      expect(stateUpdate).toHaveProperty("status", "running");
      expect(stateUpdate).toHaveProperty("waitingJobs", []);
      expect(stateUpdate).toHaveProperty("result", undefined);
      expect(stateUpdate).toHaveProperty("messages");

      // Tool call should only have been invoked once
      expect(toolHandler).toHaveBeenCalledTimes(1);

      // ToolExecutor calls the handler with a bunch of parameters we don't care about
      const arg1 = toolHandler.mock.calls[0][0];
      expect(arg1).toEqual(
        expect.objectContaining({
          input: "hello",
        }),
      );

      // We should only receive one new message, a tool call result for tool call `123`
      expect(stateUpdate.messages).toHaveLength(1);

      expect(stateUpdate.messages![0]).toHaveProperty(
        "type",
        "invocation-result",
      );

      assertMessageOfType("invocation-result", stateUpdate.messages![0]!);
      expect(stateUpdate.messages![0].data).toHaveProperty("id", "123");
    });

    it("should pause if any tool call produce a pause result", async () => {
      const messages = [
        {
          id: ulid(),
          type: "agent" as const,
          data: {
            invocations: [
              {
                id: "123",
                toolName: "console_echo",
                reasoning: "User requested",
                input: {
                  input: "hello",
                },
              },
              {
                id: "456",
                toolName: "console_echo",
                reasoning: "User requested",
                input: {
                  input: "world",
                },
              },
            ],
          },
          runId: run.id,
          clusterId: run.clusterId,
        },
      ];

      const waitingJobId = ulid();

      toolHandler.mockResolvedValueOnce(
        JSON.stringify({
          result: JSON.stringify([waitingJobId]),
          resultType: SpecialResultTypes.jobTimeout,
          status: "success",
        }),
      );

      toolHandler.mockResolvedValueOnce(
        JSON.stringify({
          result: JSON.stringify({}),
          resultType: "resolution",
          status: "success",
        }),
      );

      const stateUpdate = await handleToolCalls(
        {
          ...baseState,
          messages,
        },
        async () => tool,
      );

      expect(toolHandler).toHaveBeenCalledTimes(2);

      // Previous issue where a success result would override the `pause` status
      expect(stateUpdate).toHaveProperty("status", "paused");
      expect(stateUpdate).toHaveProperty("waitingJobs", [waitingJobId]);
      expect(stateUpdate).toHaveProperty("result", undefined);
      expect(stateUpdate).toHaveProperty("messages");
      expect(stateUpdate.messages).toHaveLength(1);
    });
  });
});
