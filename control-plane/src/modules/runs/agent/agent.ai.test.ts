import { createRunGraph } from "./agent";
import { z } from "zod";
import { redisClient } from "../../dependencies/redis";
import { AgentTool } from "./tool";
import { assertMessageOfType } from "../messages";

if (process.env.CI) {
  jest.retryTimes(3);
  jest.setTimeout(120_000);
}

describe("Agent", () => {
  jest.setTimeout(120000);

  const toolCallback = jest.fn();

  const run = {
    id: "test",
    clusterId: "test",
    resultSchema: null,
    debug: false,
    attachedFunctions: null,
    status: "pending",
    systemPrompt: null,
    testMocks: {},
    test: false,
    reasoningTraces: false,
    enableResultGrounding: false,
  };

  const tools = [
    new AgentTool({
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

  beforeAll(async () => {
    // Ensure Redis client is connected
    await redisClient?.connect();
  });

  afterAll(async () => {
    // Close Redis connection after all tests
    await redisClient?.quit();
  });

  beforeEach(async () => {
    toolCallback.mockReset();
    // Clear all keys in Redis before each test
    await redisClient?.flushAll();
  });

  describe("function calling", () => {
    jest.setTimeout(120000);

    it("should call a tool and exit", async () => {
      const app = await createRunGraph({
        run: run,
        getAttachedTools: async () => tools,
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
            type: "human",
            data: {
              message: "echo the word 'hello'",
            },
            id: "test-msg-1",
            createdAt: new Date(),
          },
        ],
      });

      expect(toolCallback).toHaveBeenCalledWith("hello");

      expect(outputState.run).toEqual({
        ...run,
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
      const app = await createRunGraph({
        run: run,
        getAttachedTools: async () => tools,
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
            type: "human",
            data: {
              message: "echo the word 'hello' and then the word 'goodbye'",
            },
            id: "test-msg-1",
            createdAt: new Date(),
          },
        ],
      });

      expect(toolCallback).toHaveBeenNthCalledWith(1, "hello");
      expect(toolCallback).toHaveBeenNthCalledWith(2, "goodbye");

      expect(outputState.run).toEqual(run);

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
      const app = await createRunGraph({
        run: run,
        getAttachedTools: async () => tools,
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
            type: "human",
            data: {
              message: "echo the word 'hello'",
            },
            id: "test-msg-1",
            createdAt: new Date(),
          },
        ],
      });

      expect(toolCallback).toHaveBeenCalledWith("hello");

      expect(outputState.run).toEqual(run);

      expect(outputState.messages).toHaveLength(4);
      expect(outputState.messages[0]).toHaveProperty("type", "human");
      expect(outputState.messages[1]).toHaveProperty("type", "agent");
      expect(outputState.messages[2]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[3]).toHaveProperty("type", "agent");

      const resultMessage = assertMessageOfType(
        "invocation-result",
        outputState.messages[2],
      );
      const topLevelResult = resultMessage.data.result;
      Object.keys(topLevelResult).forEach(key => {
        expect(topLevelResult[key]).toEqual({
          result: "Failed to echo the word 'hello'",
          status: "success",
          resultType: "rejection",
        });
      });
    });
  });

  describe("result schema", () => {
    jest.setTimeout(120000);

    it("should result result schema", async () => {
      const app = await createRunGraph({
        run: {
          ...run,
          resultSchema: {
            type: "object",
            properties: {
              word: {
                type: "string",
              },
            },
          },
        },
        getAttachedTools: async () => tools,
        getTool: async () => tools[0],
        postStepSave: async () => {},
      });

      const messages = [
        {
          type: "human",
          data: {
            message: "Return the word 'hello'",
          },
          id: "test-msg-1",
          createdAt: new Date(),
        },
      ];

      const outputState = await app.invoke({
        run,
        messages,
      });

      expect(outputState.messages).toHaveLength(2);
      expect(outputState.messages[0]).toHaveProperty("type", "human");
      expect(outputState.messages[1]).toHaveProperty("type", "agent");
      expect(outputState.messages[1].data.result).toHaveProperty(
        "word",
        "hello",
      );

      expect(outputState.result).toEqual({
        word: "hello",
      });
    });
  });

  describe("early exit", () => {
    jest.setTimeout(120000);

    it("should resume with pending tool call", async () => {
      // Model requested function call, and Run was interrupted
      const messages = [
        {
          type: "human",
          data: {
            message: "echo the word 'hello' and then the word 'goodbye'",
          },
          id: "test-msg-1",
          createdAt: new Date(),
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
          id: "test-msg-2",
          createdAt: new Date(),
        },
        // Something caused the Run to interrupt (request approval / host crashed, etc)
      ];

      const app = await createRunGraph({
        run: run,
        getAttachedTools: async () => tools,
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
        run,
        messages,
      });

      expect(toolCallback).toHaveBeenCalledTimes(2);
      expect(toolCallback).toHaveBeenNthCalledWith(1, "hello");
      expect(toolCallback).toHaveBeenNthCalledWith(2, "goodbye");

      expect(outputState.run).toEqual(run);

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
      // Model requested first function call and Run was interrupted.
      const messages = [
        {
          type: "human",
          data: {
            message: "Echo the word 'hello' and then 'goodbye'",
          },
          id: "test-msg-1",
          createdAt: new Date(),
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
          id: "test-msg-2",
          createdAt: new Date(),
        },
        {
          type: "invocation-result",
          data: { id: "123", result: { output: "hello" } },
          id: "test-msg-3",
          createdAt: new Date(),
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
          id: "test-msg-4",
          createdAt: new Date(),
        },
        // Something caused the Run to interrupt (request approval / host crashed, etc)
      ];

      const app = await createRunGraph({
        run,
        getAttachedTools: async () => tools,
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
        run,
        messages,
      });

      // After we resume, we should not call echo with "hello" again.
      expect(toolCallback).toHaveBeenCalledTimes(1);
      expect(toolCallback).toHaveBeenNthCalledWith(1, "goodbye");

      expect(outputState.run).toEqual(run);

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
        new AgentTool({
          name: "searchHaystack",
          description: "Search haystack",
          schema: z.object({}).passthrough(),
          func: async (input: any) => {
            return toolCallback(input.input);
          },
        }),
      ];

      const app = await createRunGraph({
        run: {
          ...run,
          resultSchema: {
            type: "object",
            properties: {
              word: {
                type: "string",
              },
            },
          },
        },
        getAttachedTools: async () => tools,
        getTool: async input =>
          tools.find(tool => tool.name === input.toolName)!,
        postStepSave: async () => {},
        mockModelResponses: [
          JSON.stringify({
            done: false,
            invocations: [
              {
                toolName: "searchHaystack",
                input: {},
              },
            ],
          }),
          JSON.stringify({
            done: true,
            result: {
              word: "needle",
            },
          }),
        ],
      });

      toolCallback.mockResolvedValue(
        JSON.stringify({
          result: JSON.stringify({
            word: "needle",
          }),
          resultType: "resolution",
          status: "success",
        }),
      );

      const outputState = await app.invoke({
        messages: [
          {
            type: "human",
            data: {
              message: "What is the special word?",
            },
            id: "test-msg-1",
            createdAt: new Date(),
          },
        ],
      });

      expect(outputState.messages).toHaveLength(4);
      expect(outputState.messages[0]).toHaveProperty("type", "human");
      expect(outputState.messages[1]).toHaveProperty("type", "agent");
      expect(outputState.messages[2]).toHaveProperty(
        "type",
        "invocation-result",
      );
      expect(outputState.messages[3]).toHaveProperty("type", "agent");
      expect(outputState.messages[3].data).toHaveProperty("result", {
        word: "needle",
      });
      expect(toolCallback).toHaveBeenCalledTimes(1);
    });
  });
});
