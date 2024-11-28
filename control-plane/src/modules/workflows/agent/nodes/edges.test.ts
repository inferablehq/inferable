import { postModelEdge, postStartEdge } from "./edges";
import { WorkflowAgentState } from "../state";
import { TOOL_CALL_NODE_NAME } from "./tool-call";
import { ulid } from "ulid";
import { END } from "@langchain/langgraph";
import { MODEL_CALL_NODE_NAME } from "./model-call";

describe("postStartEdge", () => {
  const baseState: WorkflowAgentState = {
    workflow: {
      id: "test",
      clusterId: "test",
    },
    status: "running",
    messages: [],
    waitingJobs: [],
    allAvailableTools: [],
  };

  it("should return END when there are waiting jobs", async () => {
    const state: WorkflowAgentState = {
      ...baseState,
      waitingJobs: [ulid()],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(END);
  });

  it("should return TOOL_CALL_NODE_NAME when the last message is a function call", async () => {
    const state: WorkflowAgentState = {
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
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(TOOL_CALL_NODE_NAME);
  });

  it("should return TOOL_CALL_NODE_NAME when there are outstanding tool calls", async () => {
    const state: WorkflowAgentState = {
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
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            id: "456",
            result: { output: "world" },
          },
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(TOOL_CALL_NODE_NAME);
  });

  it("should return MODEL_CALL_NODE_NAME when all tool calls are resolved", async () => {
    const state: WorkflowAgentState = {
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
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            id: "456",
            result: { output: "world" },
          },
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            id: "123",
            result: { output: "hello" },
          },
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(MODEL_CALL_NODE_NAME);
  });

  it("should return MODEL_CALL_NODE_NAME when the last message is a human message", async () => {
    const state: WorkflowAgentState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "human" as const,
          data: {
            message: "Human input",
          },
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(MODEL_CALL_NODE_NAME);
  });

  it("should return MODEL_CALL_NODE_NAME when the last message is a tool message", async () => {
    const state: WorkflowAgentState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            id: "123",
            result: { output: "hello" },
          },
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(MODEL_CALL_NODE_NAME);
  });

  it("should return END when the last message is an AI message without a tool call", async () => {
    const state: WorkflowAgentState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "agent" as const,
          data: {
            invocations: [],
          },
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
      ],
    };

    const result = await postStartEdge(state);
    expect(result).toBe(END);
  });
});

describe("postModelEdge", () => {
  const baseState: WorkflowAgentState = {
    workflow: {
      id: "test",
      clusterId: "test",
    },
    status: "running",
    messages: [],
    waitingJobs: [],
    allAvailableTools: [],
  };

  it("should return end when status is not running", async () => {
    const state: WorkflowAgentState = {
      ...baseState,
      status: "paused",
    };

    const result = await postModelEdge(state, () => Promise.resolve());
    expect(result).toBe(END);
  });

  it("should return TOOL_CALL_NODE_NAME when the last message has invocations", async () => {
    const state: WorkflowAgentState = {
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
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
      ],
    };

    const result = await postModelEdge(state, () => Promise.resolve());
    expect(result).toBe(TOOL_CALL_NODE_NAME);
  });

  it("should return MODEL_CALL_NODE_NAME when the last message is a supervisor message", async () => {
    const state: WorkflowAgentState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "supervisor" as const,
          data: {
            message: "Please try again.",
          },
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
      ],
    };

    const result = await postModelEdge(state, () => Promise.resolve());
    expect(result).toBe(MODEL_CALL_NODE_NAME);
  });

  it("should return end when the last message is a agent with no invocations", async () => {
    const state: WorkflowAgentState = {
      ...baseState,
      messages: [
        {
          id: ulid(),
          type: "agent" as const,
          data: {
            message: "Message without invocations",
          },
          runId: baseState.workflow.id,
          clusterId: baseState.workflow.clusterId,
        },
      ],
    };

    const result = await postModelEdge(state, () => Promise.resolve());
    expect(result).toBe(END);
  });
});
