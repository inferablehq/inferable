import { DynamicStructuredTool } from "@langchain/core/tools";
import { ReleventToolLookup } from "../agent";
import { handleModelCall } from "./model-call";
import { z } from "zod";
import { WorkflowAgentState } from "../state";
import { ulid } from "ulid";
import {
  assertAgentMessage,
  assertGenericMessage,
} from "../../workflow-messages";
import { Model } from "../../../models";

describe("handleModelCall", () => {
  const workflow = {
    id: "test-workflow",
    clusterId: "test-cluster",
    reasoningTraces: true,
  };
  const state: WorkflowAgentState = {
    messages: [
      {
        id: ulid(),
        clusterId: workflow.clusterId,
        runId: workflow.id,
        data: {
          message: "What are your capabilities?",
        },
        type: "human",
      },
    ],
    waitingJobs: [],
    allAvailableTools: [],
    workflow,
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
      new DynamicStructuredTool<any>({
        name: "testTool",
        description: "A test tool",
        func: functionHandler,
        schema: z.object({}),
      }),
      new DynamicStructuredTool<any>({
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
      parsed: {
        success: true,
        data: {
          done: true,
          result: { reason: "nothing to do" },
        },
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(1);
    expect(result.status).toBe("done");

    expect(result.messages![0]).toHaveProperty("type", "agent");

    assertAgentMessage(result.messages![0]);
    expect(result.messages![0].data.invocations).not.toBeDefined();
  });

  it("should ignore done if invocations are provided", async () => {
    mockWithStructuredOutput.mockReturnValueOnce({
      raw: {
        content: [],
      },
      parsed: {
        success: true,
        data: {
          done: true,
          result: { reason: "nothing to do" },
          invocations: [
            {
              toolName: "notify",
              input: { message: "A message" },
              reasoning: "notify the system",
            },
          ],
        },
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(1);

    // Done should have been ignored
    expect(result.status).toBe("running");

    expect(result.messages![0]).toHaveProperty("type", "agent");

    assertAgentMessage(result.messages![0]);

    // Result should have been striped out
    expect(result.messages![0].data.result).not.toBeDefined();
    expect(result.messages![0].data.invocations).toHaveLength(1);
    expect(result.messages![0].data.invocations).toContainEqual({
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
      parsed: {
        success: true,
        data: {
          result: { reason: "nothing to do" },
        },
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(2);

    expect(result.status).toBe("running");

    expect(result.messages![0]).toHaveProperty("type", "agent-invalid");
    assertGenericMessage(result.messages![0]);
    expect(result.messages![0].data).toHaveProperty(
      "details",
      expect.objectContaining({
        result: { reason: "nothing to do" },
      }),
    );

    expect(result.messages![1]).toHaveProperty("type", "supervisor");
    assertGenericMessage(result.messages![1]);

    expect(result.messages![1].data).toHaveProperty(
      "message",
      "If you are not done, please provide an invocation, otherwise return done.",
    );
  });

  it("should trigger supervisor if done and no result is provided", async () => {
    mockWithStructuredOutput.mockReturnValueOnce({
      raw: {
        content: [],
      },
      parsed: {
        success: true,
        data: {
          done: true,
        },
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(2);

    expect(result.status).toBe("running");

    expect(result.messages![0]).toHaveProperty("type", "agent-invalid");
    assertGenericMessage(result.messages![0]);
    expect(result.messages![0].data).toHaveProperty(
      "details",
      expect.objectContaining({
        done: true,
      }),
    );

    expect(result.messages![1]).toHaveProperty("type", "supervisor");

    assertGenericMessage(result.messages![1]);
    expect(result.messages![1].data).toHaveProperty(
      "message",
      "Please provide a final result or a reason for stopping.",
    );
  });

  it("should re-throw errors when finding relevant tools", async () => {
    const error = new Error("Test error");

    const errorFindRelevantTools: ReleventToolLookup = async () => {
      throw error;
    };

    expect(
      handleModelCall(state, model, errorFindRelevantTools),
    ).rejects.toThrow(error);
  });

  it("should abort if a cycle is detected", async () => {
    const messages = [];

    for (let i = 0; i < 5; i++) {
      messages.push({
        id: ulid(),
        clusterId: workflow.clusterId,
        runId: workflow.id,
        type: "agent" as const,
        data: {
          invocations: [
            { done: false, learning: "I learnt some stuff" } as any,
          ],
        },
      });
      messages.push({
        id: ulid(),
        clusterId: workflow.clusterId,
        runId: workflow.id,
        type: "supervisor" as const,
        data: {
          message: "Please provide a final result or a reason for stopping.",
        },
      });
    }

    expect(
      handleModelCall({ ...state, messages }, model, findRelevantTools),
    ).rejects.toThrow("Detected cycle in workflow.");
  });

  it("should trigger supervisor if parsing fails", async () => {
    mockWithStructuredOutput.mockReturnValueOnce({
      raw: {
        content: [],
      },
      parsed: {
        success: false,
        error: {
          errors: [
            {
              path: [""],
              message: "Test error",
            },
          ],
        },
      },
    });

    const result = await handleModelCall(state, model, findRelevantTools);

    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(2);
    expect(result.status).toBe("running");

    expect(result.messages![0]).toHaveProperty("type", "agent-invalid");
    assertGenericMessage(result.messages![0]);
    expect(result.messages![0].data).toHaveProperty("details");

    expect(result.messages![1]).toHaveProperty("type", "supervisor");
    assertGenericMessage(result.messages![1]);

    expect(result.messages![1].data).toHaveProperty(
      "message",
      expect.stringContaining("Provided object was invalid, check your input"),
    );
    expect(result.messages![1].data.details).toHaveProperty("errors");
  });

  // Edge case where the model trys to call a tool (unbound) rather than returning it through `invocations` array.
  describe("additional tool calls", () => {
    it("should add call to empty invocations array", async () => {
      mockWithStructuredOutput.mockReturnValueOnce({
        parsed: {
          success: true,
          data: {
            done: false,
          },
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
      assertAgentMessage(result.messages![0]);

      expect(result.messages![0].data).toHaveProperty("invocations", [
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
        parsed: {
          success: true,
          data: {
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
      assertAgentMessage(result.messages![0]);

      expect(result.messages![0].data).toHaveProperty("invocations", [
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
