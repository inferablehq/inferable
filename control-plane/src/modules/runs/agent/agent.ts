import { START, StateGraph } from "@langchain/langgraph";
import { MODEL_CALL_NODE_NAME, handleModelCall } from "./nodes/model-call";
import { TOOL_CALL_NODE_NAME, handleToolCalls } from "./nodes/tool-call";
import { RunGraphState, createStateGraphChannels } from "./state";
import { PostStepSave, postModelEdge, postStartEdge, postToolEdge } from "./nodes/edges";
import { AgentMessage } from "../messages";
import { buildMockModel, buildModel } from "../../models";
import { AgentTool } from "./tool";
import { ChatIdentifiers } from "../../models/routing";

export type ReleventToolLookup = (state: RunGraphState) => Promise<AgentTool[]>;

export type ToolFetcher = (
  toolCall: Required<AgentMessage["data"]>["invocations"][number]
) => Promise<AgentTool>;

export const createRunGraph = async ({
  run,
  additionalContext,
  allAvailableTools = [],
  postStepSave,
  findRelevantTools,
  getTool,
  mockModelResponses,
}: {
  run: {
    id: string;
    clusterId: string;
    modelIdentifier: ChatIdentifiers | null;
    resultSchema: unknown | null;
    debug: boolean;
    attachedFunctions: string[] | null;
    status: string;
    systemPrompt: string | null;
    testMocks: Record<string, { output: Record<string, unknown> }> | null;
    test: boolean;
    reasoningTraces: boolean;
    enableResultGrounding: boolean;
  };
  additionalContext?: string;
  allAvailableTools?: string[];
  postStepSave: PostStepSave;
  findRelevantTools: ReleventToolLookup;
  getTool: ToolFetcher;
  mockModelResponses?: string[];
}) => {
  const graph = new StateGraph<RunGraphState>({
    channels: createStateGraphChannels({
      run,
      allAvailableTools,
      additionalContext,
    }),
  })
    .addNode(MODEL_CALL_NODE_NAME, state =>
      handleModelCall(
        state,
        mockModelResponses
          ? // If mock responses are provided, use the mock model
            buildMockModel({
              mockResponses: mockModelResponses,
              responseCount: state.messages.filter(m => m.type === "agent").length,
            })
          : // Otherwise, use the real model
            buildModel({
              identifier: run.modelIdentifier ?? "claude-3-5-sonnet",
              purpose: "agent_loop.reasoning",
              trackingOptions: {
                clusterId: state.run.clusterId,
                runId: state.run.id,
              },
            }),
        findRelevantTools
      )
    )
    .addNode(TOOL_CALL_NODE_NAME, state => handleToolCalls(state, getTool))
    .addConditionalEdges(START, postStartEdge)
    .addConditionalEdges(MODEL_CALL_NODE_NAME, state => postModelEdge(state, postStepSave))
    .addConditionalEdges(TOOL_CALL_NODE_NAME, state => postToolEdge(state, postStepSave));

  return graph.compile();
};
