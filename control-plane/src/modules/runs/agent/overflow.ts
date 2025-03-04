import { AgentError } from "../../../utilities/errors";
import { logger } from "../../observability/logger";
import { RunGraphStateMessage } from "./state";
import { estimateTokenCount } from "./utils";

const TOTAL_CONTEXT_THRESHOLD = 0.95;
const SYSTEM_PROMPT_THRESHOLD = 0.7;

export const handleContextWindowOverflow = async ({
  messages,
  systemPrompt,
  modelContextWindow,
  render = JSON.stringify,
}: {
  messages: RunGraphStateMessage[];
  systemPrompt: string;
  modelContextWindow?: number;
  render?(message: RunGraphStateMessage): unknown;
}) => {
  if (!modelContextWindow) {
    logger.warn("Model context window not set, defaulting to 100_000");
    modelContextWindow = 100_000;
  }

  const systemPromptTokenCount = await estimateTokenCount(systemPrompt);

  if (systemPromptTokenCount > modelContextWindow * SYSTEM_PROMPT_THRESHOLD) {
    throw new AgentError(
      `System prompt can not exceed ${modelContextWindow * SYSTEM_PROMPT_THRESHOLD} tokens`,
    );
  }

  const inputTokenCount = await estimateTokenCount(
    messages.map(render).join("\n"),
  );
  let messagesTokenCount = inputTokenCount;

  const removedMessages: RunGraphStateMessage[] = [];

  // Remove messages until total tokens are under threshold
  while (
    messages.length &&
    messagesTokenCount + systemPromptTokenCount >
      modelContextWindow * TOTAL_CONTEXT_THRESHOLD
  ) {
    if (messages.length === 1) {
      logger.error("A single message exceeds context window", {
        messageId: messages[0].id,
      });
      throw new AgentError("Run state is invalid");
    }

    const removed = messages.shift();
    removed && removedMessages.push(removed);

    messagesTokenCount = await estimateTokenCount(
      messages.map(render).join("\n"),
    );
  }

  // First message should always be human
  while (messages.length && !["human", "template"].includes(messages[0].type)) {
    if (messages.length === 1) {
      logger.error("Only message in message history is not human or template", {
        messageId: messages[0].id,
      });
      throw new AgentError("Run state is invalid");
    }

    const removed = messages.shift();
    removed && removedMessages.push(removed);

    messagesTokenCount = await estimateTokenCount(
      messages.map(render).join("\n"),
    );
  }

  removedMessages.length &&
    logger.info(
      "Run history exceeds context window, early messages have been truncated",
      {
        removedMessageIds: removedMessages.map((m) => m.id),
        systemPromptTokenCount,
        outputTokenCount: messagesTokenCount,
        inputTokenCount,
      },
    );

  return messages;
};
