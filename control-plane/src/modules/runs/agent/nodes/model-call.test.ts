import { ulid } from "ulid";
import { z } from "zod";
import { Model } from "../../../models";
import { assertMessageOfType } from "../../messages";
import { ReleventToolLookup } from "../agent";
import { RunGraphState } from "../state";
import { AgentTool } from "../tool";
import { handleModelCall } from "./model-call";

describe("handleModelCall", () => {
  const run = {
    id: "test-run",
    clusterId: "test-cluster",
    modelIdentifier: null,
    resultSchema: null,
    debug: false,
    attachedFunctions: null,
    status: "running",
    systemPrompt: null,
    testMocks: {},
    test: false,
    reasoningTraces: true,
    enableResultGrounding: false,
  };
  const state: RunGraphState = {
    messages: [
      {
        id: ulid(),
        clusterId: run.clusterId,
        runId: run.id,
        data: {
          message: "What are your capabilities?",
        },
        type: "human",
      },
    ],
    waitingJobs: [],
    allAvailableTools: [],
    run: run,
    additionalContext: "",
    status: "running",
  };

  const mockWithStructuredOutput = jest.fn();
  const mockWithRawOutput = jest.fn();

  const model: Model = {
    identifier: "claude-3-5-sonnet",
    call: mockWithRawOutput,
    structured: mockWithStructuredOutput,
    embedQuery: jest.fn(),
  };

  const functionHandler = jest.fn(async () => "Test result");
  const findRelevantTools: ReleventToolLookup = async () => {
    return [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new AgentTool({
        name: "testTool",
        description: "A test tool",
        func: functionHandler,
        schema: z.object({}),
      }),
      new AgentTool({
        name: "notify",
        description: "Send a message",
        func: functionHandler,
        schema: z.object({ message: z.string() }),
      }),
    ];
  };

  it("should handle successful model call", async () => {
    mockWithStructuredOutput.mockReturnValueOnce({
      raw: {
        content: [],
      },
      structured: {
        done: true,
        message: "nothing to do",
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(1);
    expect(result.status).toBe("done");

    expect(result.messages![0]).toHaveProperty("type", "agent");

    const agentMessage = assertMessageOfType("agent", result.messages![0]);
    expect(agentMessage.data.invocations).not.toBeDefined();
  });

  it("should ignore done if invocations are provided", async () => {
    mockWithStructuredOutput.mockReturnValueOnce({
      raw: {
        content: [],
      },
      structured: {
        done: true,
        message: "nothing to do",
        invocations: [
          {
            toolName: "notify",
            input: { message: "A message" },
            reasoning: "notify the system",
          },
        ],
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(1);

    // Done should have been ignored
    expect(result.status).toBe("running");

    expect(result.messages![0]).toHaveProperty("type", "agent");

    const agentMessage = assertMessageOfType("agent", result.messages![0]);

    // Result should have been striped out
    expect(agentMessage.data.result).not.toBeDefined();
    expect(agentMessage.data.invocations).toHaveLength(1);
    expect(agentMessage.data.invocations).toContainEqual({
      id: expect.any(String),
      toolName: "notify",
      input: { message: "A message" },
      reasoning: "notify the system",
    });
  });

  it("should trigger supervisor if not done and no invocations are provided", async () => {
    mockWithStructuredOutput.mockReturnValueOnce({
      raw: {
        content: [],
      },
      structured: {
        message: "nothing to do",
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(2);

    expect(result.status).toBe("running");

    expect(result.messages![0]).toHaveProperty("type", "agent-invalid");
    const invalidMessage = assertMessageOfType("agent-invalid", result.messages![0]);
    expect(invalidMessage.data).toHaveProperty(
      "details",
      expect.objectContaining({
        message: "nothing to do",
      })
    );

    expect(result.messages![1]).toHaveProperty("type", "supervisor");
    const supervisorMessage = assertMessageOfType("supervisor", result.messages![1]);

    expect(supervisorMessage.data).toHaveProperty(
      "message",
      "If you are not done, please provide an invocation, otherwise return done."
    );
  });

  it("should trigger supervisor if done and no result is provided", async () => {
    mockWithStructuredOutput.mockReturnValueOnce({
      raw: {
        content: [],
      },
      structured: {
        done: true,
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(2);

    expect(result.status).toBe("running");

    expect(result.messages![0]).toHaveProperty("type", "agent-invalid");
    const invalidMessage = assertMessageOfType("agent-invalid", result.messages![0]);
    expect(invalidMessage.data).toHaveProperty(
      "details",
      expect.objectContaining({
        done: true,
      })
    );

    expect(result.messages![1]).toHaveProperty("type", "supervisor");

    const supervisorMessage = assertMessageOfType("supervisor", result.messages![1]);
    expect(supervisorMessage.data).toHaveProperty(
      "message",
      "Please provide a final result before stopping. Refer to the final_result_schema for the expected format. If you have insufficient information to provide a result, please provide a message describing why you can't provide a result."
    );
  });

  it("should re-throw errors when finding relevant tools", async () => {
    const error = new Error("Test error");

    const errorFindRelevantTools: ReleventToolLookup = async () => {
      throw error;
    };

    expect(handleModelCall(state, model, errorFindRelevantTools)).rejects.toThrow(error);
  });

  it("should abort if a cycle is detected", async () => {
    const messages = [];

    for (let i = 0; i < 5; i++) {
      messages.push({
        id: ulid(),
        clusterId: run.clusterId,
        runId: run.id,
        type: "agent" as const,
        data: {
          invocations: [{ done: false, learning: "I learnt some stuff" } as any],
        },
      });
      messages.push({
        id: ulid(),
        clusterId: run.clusterId,
        runId: run.id,
        type: "supervisor" as const,
        data: {
          message:
            "Please provide a final result before stopping. Refer to the final_result_schema for the expected format. If you have insufficient information to provide a result, please provide a message describing why you can't provide a result.",
        },
      });
    }

    expect(handleModelCall({ ...state, messages }, model, findRelevantTools)).rejects.toThrow(
      "Detected cycle in Run."
    );
  });

  it("should trigger supervisor if parsing fails", async () => {
    mockWithStructuredOutput.mockReturnValueOnce({
      raw: {
        content: [],
      },
      structured: {
        randomStuff: "123",
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(2);
    expect(result.status).toBe("running");

    expect(result.messages![0]).toHaveProperty("type", "agent-invalid");
    const invalidMessage = assertMessageOfType("agent-invalid", result.messages![0]);
    expect(invalidMessage.data).toHaveProperty("details");

    expect(result.messages![1]).toHaveProperty("type", "supervisor");
    const supervisorMessage = assertMessageOfType("supervisor", result.messages![1]);

    expect(supervisorMessage.data).toHaveProperty(
      "message",
      expect.stringContaining("Provided object was invalid, check your input")
    );
    expect(supervisorMessage.data.details).toHaveProperty("errors");
  });

  // Edge case where the model trys to call a tool (unbound) rather than returning it through `invocations` array.
  describe("additional tool calls", () => {
    it("should add call to empty invocations array", async () => {
      mockWithStructuredOutput.mockReturnValueOnce({
        structured: {
          done: false,
        },
        raw: {
          content: [
            {
              type: "tool_use",
              name: "extract",
              input: {
                done: false,
              },
            },
            {
              type: "tool_use",
              name: "notify",
              input: {
                message: "A message to another system",
              },
            },
          ],
        },
      });

      const result = await handleModelCall(state, model, findRelevantTools);

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.status).toBe("running");

      expect(result.messages![0]).toHaveProperty("type", "agent");
      const agentMessage = assertMessageOfType("agent", result.messages![0]);

      expect(agentMessage.data).toHaveProperty("invocations", [
        {
          id: expect.any(String),
          toolName: "notify",
          reasoning: "Extracted from tool calls",
          input: {
            message: "A message to another system",
          },
        },
      ]);
    });

    it("should add to existing invocations array", async () => {
      mockWithStructuredOutput.mockReturnValueOnce({
        structured: {
          done: false,
          invocations: [
            {
              toolName: "notify",
              reasoning: "notify the system",
              input: {
                message: "the first notification",
              },
            },
          ],
        },
        raw: {
          content: [
            {
              type: "tool_use",
              name: "extract",
              input: {
                done: false,
              },
            },
            {
              type: "tool_use",
              name: "notify",
              input: {
                message: "A message to another system",
              },
            },
          ],
        },
      });

      const result = await handleModelCall(state, model, findRelevantTools);

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.status).toBe("running");

      expect(result.messages![0]).toHaveProperty("type", "agent");
      const agentMessage = assertMessageOfType("agent", result.messages![0]);

      expect(agentMessage.data).toHaveProperty("invocations", [
        {
          id: expect.any(String),
          toolName: "notify",
          reasoning: "notify the system",
          input: {
            message: "the first notification",
          },
        },
        {
          id: expect.any(String),
          toolName: "notify",
          reasoning: "Extracted from tool calls",
          input: {
            message: "A message to another system",
          },
        },
      ]);
    });
  });
});
