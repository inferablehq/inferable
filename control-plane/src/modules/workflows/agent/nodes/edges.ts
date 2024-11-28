import { END } from "@langchain/langgraph";
import { logger } from "../../../observability/logger";
import { WorkflowAgentState } from "../state";
import { TOOL_CALL_NODE_NAME } from "./tool-call";
import { MODEL_CALL_NODE_NAME } from "./model-call";
import { hasInvocations } from "../../workflow-messages";

export type PostStepSave = (state: WorkflowAgentState) => Promise<void>;

export const postStartEdge = async (state: WorkflowAgentState) => {
  if (state.waitingJobs?.length > 0) {
    logger.info("Workflow will not resume with waiting jobs", {
      waitingJobs: state.waitingJobs,
    });

    return END;
  }

  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage.type == "agent") {
    if (hasInvocations(lastMessage)) {
      return TOOL_CALL_NODE_NAME;
    }

    logger.info("Workflow will not resume from AIMessage without tool calls");

    return END;
  }

  if (await hasOutstandingToolCalls(state)) {
    return TOOL_CALL_NODE_NAME;
  }

  return MODEL_CALL_NODE_NAME;
};

const hasOutstandingToolCalls = async (
  state: WorkflowAgentState,
): Promise<boolean> => {
  const toolInvocations: string[] = [];
  const toolResolutions: string[] = [];

  for await (const message of state.messages) {
    if (message.type == "agent") {
      message.data.invocations?.forEach((tool) => {
        tool.id && toolInvocations.push(tool.id);
      });
    } else if (message.type == "invocation-result") {
      toolResolutions.push(message.data.id);
    }
  }

  return !!toolInvocations.find((tool) => !toolResolutions.includes(tool));
};

export const postToolEdge = async (
  state: WorkflowAgentState,
  postStepSave: PostStepSave,
) => {
  await postStepSave(state);
  switch (state.status) {
    case "done":
    case "paused":
      return END;
    default:
      return MODEL_CALL_NODE_NAME;
  }
};

export const postModelEdge = async (
  state: WorkflowAgentState,
  postStepSave: PostStepSave,
) => {
  await postStepSave(state);
  switch (state.status) {
    case "done":
    case "paused":
      return END;
    default: {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage.type === "agent") {
        if (hasInvocations(lastMessage)) {
          return TOOL_CALL_NODE_NAME;
        }

        logger.warn(
          "Model step returned an agent message without tool calls and status is not done",
        );
        return END;
      }

      return MODEL_CALL_NODE_NAME;
    }
  }
};
