import { AgentError } from "../../../utilities/errors";
import { logger } from "../../observability/logger";
import { WorkflowAgentStateMessage } from "./state";
import { estimateTokenCount } from "./utils";

const TOTAL_CONTEXT_THRESHOLD = 0.95;
const SYSTEM_PROMPT_THRESHOLD = 0.7;

export const handleContextWindowOverflow = async ({
  systemPrompt,
  messages,
  modelContextWindow,
  render = JSON.stringify
}: {
  systemPrompt: string
  messages: WorkflowAgentStateMessage[]
  modelContextWindow: number
  render? (message: WorkflowAgentStateMessage): unknown
  //strategy?: "truncate"
}) => {
  const systemPromptTokenCount = await estimateTokenCount(systemPrompt);

  if (systemPromptTokenCount > modelContextWindow * SYSTEM_PROMPT_THRESHOLD) {
    throw new AgentError(`System prompt can not exceed ${modelContextWindow * SYSTEM_PROMPT_THRESHOLD} tokens`);
  }

  let messagesTokenCount = await estimateTokenCount(messages.map(render).join("\n"));
  if (messagesTokenCount + systemPromptTokenCount < (modelContextWindow * TOTAL_CONTEXT_THRESHOLD)) {
    return messages;
  }

  logger.info("Chat history exceeds context window, early messages will be dropped", {
    systemPromptTokenCount,
    messagesTokenCount,
  })

  do {
    if (messages.length === 1) {
      throw new AgentError("Single chat message exceeds context window");
    }

    messages.shift();

    messagesTokenCount = await estimateTokenCount(messages.map(render).join("\n"));

  } while (messagesTokenCount + systemPromptTokenCount > modelContextWindow * TOTAL_CONTEXT_THRESHOLD || messages[0].type !== 'human');

  return messages;
};
