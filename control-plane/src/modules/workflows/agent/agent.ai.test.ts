import { DynamicStructuredTool } from "@langchain/core/tools";
import { createWorkflowAgent } from "./agent";
import { z } from "zod";
import { ulid } from "ulid";
import { SpecialResultTypes } from "./tools/functions";
import { assertResultMessage } from "../workflow-messages";
import { WorkflowAgentStateMessage } from "./state";

if (process.env.CI) {
  jest.retryTimes(3);
  jest.setTimeout(120_000);
}

describe("Agent", () => {
  jest.setTimeout(120000);

  const toolCallback = jest.fn();

  const workflow = {
    id: "test",
    clusterId: "test",
  };

  const tools = [
    new DynamicStructuredTool<any>({
      name: "echo",
      description: "Echoes the input",
      schema: z.object({
        input: z.string(),
      }),
      func: async (input: any) => {
        return toolCallback(input.input);
      },
    }),
  ];

  beforeEach(async () => {
    toolCallback.mockReset();
  });

  describe("function calling", () => {
    jest.setTimeout(120000);

    it("should call a tool and exit", async () => {
      const app = await createWorkflowAgent({
        workflow,
        findRelevantTools: async () => tools,
        getTool: async () => tools[0],
        postStepSave: async () => {},
      });

      const toolResponse = JSON.stringify({
        result: "done",
        resultType: "resolution",
        status: "success",
      });

      toolCallback.mockResolvedValue(toolResponse);

      const outputState = await app.invoke({
        messages: [
          {
            data: {
              message: "echo the word 'hello'",
            },
            type: "human",
          },
        ],
      });

      expect(toolCallback).toHaveBeenCalledWith("hello");

      expect(outputState.workflow).toEqual({
        ...workflow,
        checkpointData: undefined,
      });

      expect(outputState.messages).toHaveLength(4);

      expect(outputState.messages[0]).toHaveProperty("type", "human");
      expect(outputState.messages[1]).toHaveProperty("type", "agent");
      expect(outputState.messages[2]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[3]).toHaveProperty("type", "agent");
    });

    it("should call a tool multiple times and exit", async () => {
      const app = await createWorkflowAgent({
        workflow,
        findRelevantTools: async () => tools,
        getTool: async () => tools[0],
        postStepSave: async () => {},
      });

      const toolResponse = JSON.stringify({
        result: "Word was echoed",
        resultType: "resolution",
        status: "success",
      });

      toolCallback.mockResolvedValue(toolResponse);

      const outputState = await app.invoke({
        messages: [
          {
            data: {
              message: "echo the word 'hello' and then the word 'goodbye'",
            },
            type: "human",
          },
        ],
      });

      expect(toolCallback).toHaveBeenNthCalledWith(1, "hello");
      expect(toolCallback).toHaveBeenNthCalledWith(2, "goodbye");

      expect(outputState.workflow).toEqual(workflow);

      expect(outputState.messages).toHaveLength(5);
      expect(outputState.messages[0]).toHaveProperty("type", "human");
      expect(outputState.messages[1]).toHaveProperty("type", "agent");
      expect(outputState.messages[2]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[3]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[4]).toHaveProperty("type", "agent");
    });

    it("should present tool failure to agent", async () => {
      const app = await createWorkflowAgent({
        workflow,
        findRelevantTools: async () => tools,
        getTool: async () => tools[0],
        postStepSave: async () => {},
      });

      const toolResponse = JSON.stringify({
        result: "Failed to echo the word 'hello'",
        resultType: "rejection",
        status: "success",
      });

      toolCallback.mockResolvedValue(toolResponse);

      const outputState = await app.invoke({
        messages: [
          {
            data: {
              message: "echo the word 'hello'",
            },
            type: "human",
          },
        ],
      });

      expect(toolCallback).toHaveBeenCalledWith("hello");

      expect(outputState.workflow).toEqual(workflow);

      expect(outputState.messages).toHaveLength(4);
      expect(outputState.messages[0]).toHaveProperty("type", "human");
      expect(outputState.messages[1]).toHaveProperty("type", "agent");
      expect(outputState.messages[2]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[3]).toHaveProperty("type", "agent");

      assertResultMessage(outputState.messages[2]);
      expect(outputState.messages[2].data.result).toHaveProperty(
        "result",
        expect.stringContaining("Failed to echo the word 'hello'"),
      );
    });
  });

  describe("early exit", () => {
    jest.setTimeout(120000);

    it("should resume with pending tool call", async () => {
      // Model requested function call, and workflow was interrupted
      const messages = [
        {
          type: "human",
          data: {
            message: "echo the word 'hello' and then the word 'goodbye'",
          },
        },
        {
          type: "agent",
          data: {
            invocations: [
              {
                id: "123",
                toolName: "echo",
                reasoning: "User requested",
                input: {
                  input: "hello",
                },
              },
            ],
          },
        },
        // Something caused the workflow to interrupt (request approval / host crashed, etc)
      ];

      const app = await createWorkflowAgent({
        workflow,
        findRelevantTools: async () => tools,
        getTool: async () => tools[0],
        postStepSave: async () => {},
      });

      const toolResponse = JSON.stringify({
        result: "done",
        resultType: "resolution",
        status: "success",
      });

      toolCallback.mockResolvedValue(toolResponse);

      const outputState = await app.invoke({
        workflow,
        messages,
      });

      expect(toolCallback).toHaveBeenCalledTimes(2);
      expect(toolCallback).toHaveBeenNthCalledWith(1, "hello");
      expect(toolCallback).toHaveBeenNthCalledWith(2, "goodbye");

      expect(outputState.workflow).toEqual(workflow);

      expect(outputState.messages).toHaveLength(6);

      expect(outputState.messages[0]).toHaveProperty("type", "human");
      expect(outputState.messages[1]).toHaveProperty("type", "agent");
      expect(outputState.messages[2]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[3]).toHaveProperty("type", "agent");
      expect(outputState.messages[4]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[5]).toHaveProperty("type", "agent");
    });

    it("should not recall the same function after resumption", async () => {
      // Model requested first function call and workflow was interrupted.
      const messages = [
        {
          type: "human",
          data: {
            message: "Echo the word 'hello' and then 'goodbye'",
          },
        },
        {
          type: "agent",
          data: {
            invocations: [
              {
                id: "123",
                toolName: "echo",
                reasoning: "User requested",
                input: { input: "hello" },
              },
            ],
          },
        },
        {
          type: "invocation-result",
          data: { id: "123", result: { output: "hello" } },
        },
        {
          type: "agent",
          data: {
            invocations: [
              {
                id: "456",
                toolName: "echo",
                reasoning: "User requested",
                input: { input: "goodbye" },
              },
            ],
          },
        },
        // Something caused the workflow to interrupt (request approval / host crashed, etc)
      ];

      const app = await createWorkflowAgent({
        workflow,
        findRelevantTools: async () => tools,
        getTool: async () => tools[0],
        postStepSave: async () => {},
      });

      const toolResponse = JSON.stringify({
        result: "done",
        resultType: "resolution",
        status: "success",
      });

      toolCallback.mockResolvedValue(toolResponse);

      const outputState = await app.invoke({
        workflow,
        messages,
      });

      // After we resume, we should not call echo with "hello" again.
      expect(toolCallback).toHaveBeenCalledTimes(1);
      expect(toolCallback).toHaveBeenNthCalledWith(1, "goodbye");

      expect(outputState.workflow).toEqual(workflow);

      expect(outputState.messages).toHaveLength(6);

      expect(outputState.messages[0]).toHaveProperty("type", "human");
      expect(outputState.messages[1]).toHaveProperty("type", "agent");
      expect(outputState.messages[2]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[3]).toHaveProperty("type", "agent");
      expect(outputState.messages[4]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[5]).toHaveProperty("type", "agent");
    });


    it("should respect mock responses", async () => {
      const tools = [
        new DynamicStructuredTool<any>({
          name: "searchHaystack",
          description: "Search haystack",
          schema: z.object({
          }).passthrough(),
          func: async (input: any) => {
            return toolCallback(input.input);
          },
        }),
      ];

      const app = await createWorkflowAgent({
        workflow: {
          ...workflow,
          resultSchema: {
            type: "object",
            properties: {
              word: {
                type: "string"
              }
            }
          }
        },
        allAvailableTools: ["searchHaystack"],
        findRelevantTools: async () => tools,
        getTool: async (input) =>
          tools.find((tool) => tool.name === input.toolName)!,
        postStepSave: async () => {},
        mockModelResponses: [
          JSON.stringify({
            done: false,
            invocations: [
              {
                toolName: "searchHaystack",
                input: {}
              }
            ]
          }),
          JSON.stringify({
            done: true,
            result: {
              word: "needle"
            }
          })
        ]
      });


      toolCallback.mockResolvedValue(JSON.stringify({
        result: JSON.stringify({
          word: "needle"
        }),
        resultType: "resolution",
        status: "success",
      }));

      const outputState = await app.invoke({
        messages: [
          {
            data: {
              message: "What is the special word?",
            },
            type: "human",
          },
        ],
      });

      expect(outputState.messages).toHaveLength(4);
      expect(outputState.messages[0]).toHaveProperty("type", "human");
      expect(outputState.messages[1]).toHaveProperty("type", "agent");
      expect(outputState.messages[2]).toHaveProperty("type", "invocation-result");
      expect(outputState.messages[3]).toHaveProperty("type", "agent");
      expect(outputState.messages[3].data).toHaveProperty(
        "result",
        {
          word: "needle"
        }
      )
      expect(toolCallback).toHaveBeenCalledTimes(1);
    });
  });

});
