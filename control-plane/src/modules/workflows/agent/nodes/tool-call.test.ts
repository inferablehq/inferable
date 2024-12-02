import { handleToolCalls } from "./tool-call";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { SpecialResultTypes } from "../tools/functions";
import { NotFoundError } from "../../../../utilities/errors";
import { ulid } from "ulid";
import { WorkflowAgentState } from "../state";
import { assertResultMessage } from "../../workflow-messages";
import { redisClient } from "../../../redis";

describe("handleToolCalls", () => {
  const workflow = {
    id: "test",
    clusterId: "test",
  };

  const toolHandler = jest.fn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tool = new DynamicStructuredTool<any>({
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
      runId: workflow.id,
      clusterId: workflow.clusterId,
    },
  ];

  const baseState: WorkflowAgentState = {
    messages,
    workflow,
    status: "running",
    allAvailableTools: [],
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

    assertResultMessage(stateUpdate.messages![0]!);

    expect(stateUpdate.messages![0]?.data.result).toHaveProperty(
      "message",
      expect.stringContaining(`Failed to find tool: console_echo`),
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
        runId: workflow.id,
        clusterId: workflow.clusterId,
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
    assertResultMessage(stateUpdate.messages![0]);

    expect(stateUpdate.messages![0].data.result).toEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          `Provided input did not match schema for ${tool.name}`,
        ),
        parseResult: expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            issues: expect.arrayContaining([
              expect.objectContaining({
                code: "invalid_type",
                expected: "string",
                received: "undefined",
                path: ["input"],
                message: "Required",
              }),
            ]),
          }),
        }),
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
          runId: workflow.id,
          clusterId: workflow.clusterId,
        },
        {
          id: ulid(),
          type: "invocation-result" as const,
          message: "",
          data: {
            id: "456",
            result: { output: "world" },
          },
          runId: workflow.id,
          clusterId: workflow.clusterId,
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

      assertResultMessage(stateUpdate.messages![0]);
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
          runId: workflow.id,
          clusterId: workflow.clusterId,
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
