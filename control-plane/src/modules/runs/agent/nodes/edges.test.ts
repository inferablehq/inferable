import { postModelEdge, postStartEdge } from "./edges";
import { RunGraphState } from "../state";
import { TOOL_CALL_NODE_NAME } from "./tool-call";
import { ulid } from "ulid";
import { END } from "@langchain/langgraph";
import { MODEL_CALL_NODE_NAME } from "./model-call";

describe("postStartEdge", () => {
  const baseState: RunGraphState = {
    run: {
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
    },
    status: "running",
    messages: [],
    waitingJobs: [],
    allAvailableTools: [],
  };

  it("should return END when there are waiting jobs", async () => {
    const state: RunGraphState = {
      ...baseState,
      waitingJobs: [ulid()],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(END);
  });

  it("should return TOOL_CALL_NODE_NAME when the last message is a function call", async () => {
    const state: RunGraphState = {
      ...baseState,
      messages: [
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
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
          createdAt: new Date(),
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(TOOL_CALL_NODE_NAME);
  });

  it("should return TOOL_CALL_NODE_NAME when there are outstanding tool calls", async () => {
    const state: RunGraphState = {
      ...baseState,
      messages: [
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
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            id: "456",
            toolName: "console_echo",
            resultType: "resolution",
            result: { output: "world" },
          },
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(TOOL_CALL_NODE_NAME);
  });

  it("should return MODEL_CALL_NODE_NAME when all tool calls are resolved", async () => {
    const state: RunGraphState = {
      ...baseState,
      messages: [
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
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            id: "456",
            toolName: "console_echo",
            resultType: "resolution",
            result: { output: "world" },
          },
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            id: "123",
            toolName: "console_echo",
            resultType: "resolution",
            result: { output: "hello" },
          },
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(MODEL_CALL_NODE_NAME);
  });

  it("should return MODEL_CALL_NODE_NAME when the last message is a human message", async () => {
    const state: RunGraphState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "human" as const,
          data: {
            message: "Human input",
          },
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(MODEL_CALL_NODE_NAME);
  });

  it("should return MODEL_CALL_NODE_NAME when the last message is a tool message", async () => {
    const state: RunGraphState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            id: "123",
            toolName: "console_echo",
            resultType: "resolution",
            result: { output: "hello" },
          },
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(MODEL_CALL_NODE_NAME);
  });

  it("should return END when the last message is an AI message without a tool call", async () => {
    const state: RunGraphState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "agent" as const,
          data: {
            invocations: [],
          },
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(END);
  });
});

describe("postModelEdge", () => {
  const baseState: RunGraphState = {
    run: {
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
    },
    status: "running",
    messages: [],
    waitingJobs: [],
    allAvailableTools: [],
  };

  it("should return end when status is not running", async () => {
    const state: RunGraphState = {
      ...baseState,
      status: "paused",
    };

    const result = await postModelEdge(state, () => Promise.resolve());
    expect(result).toBe(END);
  });

  it("should return TOOL_CALL_NODE_NAME when the last message has invocations", async () => {
    const state: RunGraphState = {
      ...baseState,
      messages: [
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
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
      ],
    };

    const result = await postModelEdge(state, () => Promise.resolve());
    expect(result).toBe(TOOL_CALL_NODE_NAME);
  });

  it("should return MODEL_CALL_NODE_NAME when the last message is a supervisor message", async () => {
    const state: RunGraphState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "supervisor" as const,
          data: {
            message: "Please try again.",
          },
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
      ],
    };

    const result = await postModelEdge(state, () => Promise.resolve());
    expect(result).toBe(MODEL_CALL_NODE_NAME);
  });

  it("should return end when the last message is a agent with no invocations", async () => {
    const state: RunGraphState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "agent" as const,
          data: {
            message: "Message without invocations",
          },
          runId: baseState.run.id,
          clusterId: baseState.run.clusterId,
        },
      ],
    };

    const result = await postModelEdge(state, () => Promise.resolve());
    expect(result).toBe(END);
  });
});
