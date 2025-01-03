import { ListMessagesResponse } from "./useRun";

/**
 * Message type definitions:
 *
 * @typedef {Object} HumanMessage
 * A message from a human user containing generic message data
 * @property {string} type - "human"
 * @property {Object} data - Message data
 * @property {string} data.message - The text content of the human message
 * @property {Object} [data.details] - Optional additional details about the message
 *
 * @typedef {Object} AgentMessage
 * An AI agent response containing agent-specific data
 * @property {string} type - "agent"
 * @property {Object} data - Agent response data
 * @property {boolean} [data.done] - Whether the agent has completed its task
 * @property {Object} [data.result] - The final result object if task is complete
 * @property {string} [data.message] - The text content of the agent's response
 * @property {Array<Object>} [data.learnings] - Any new information the agent has learned
 * @property {string} [data.issue] - Any issue encountered by the agent
 * @property {Array<Object>} [data.invocations] - Tool/function invocations made by the agent
 *
 * @typedef {Object} InvocationResultMessage
 * Results from function/tool invocations made by the agent
 * @property {string} type - "invocation-result"
 * @property {Object} data - Invocation result data
 * @property {string} data.id - Unique ID of the invocation
 * @property {Object} data.result - The result returned by the invoked function
 */

/**
 * Hook for managing and filtering conversation messages.
 *
 * Message types include:
 * - "human": User messages containing generic message data
 * - "agent": AI agent responses with agent-specific data
 * - "invocation-result": Results from function invocations
 *
 * @param messages - Array of messages from the conversation
 * @returns Object with utility functions for message management
 */
export const useMessages = (messages?: ListMessagesResponse) => {
  return {
    /**
     * Returns all messages sorted by ID
     * @param sort - Sort direction, either "asc" (oldest first) or "desc" (newest first)
     * @returns Sorted array of messages
     */
    all: (sort: "asc" | "desc" = "desc") =>
      messages?.sort((a, b) =>
        sort === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)
      ),
    /**
     * Filters messages by type
     * @param type - Message type to filter by
     * @returns Array of messages of the specified type
     */
    getOfType: (type: ListMessagesResponse[number]["type"]) =>
      messages?.filter(message => message.type === type),
  };
};
