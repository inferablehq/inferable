import { RunTimelineMessages } from "./useRun";

/**
 * Message types supported in the Inferable conversation system.
 * Each message type has specific data structures and purposes.
 */

/**
 * A message from a human user in the conversation
 * @typedef {Object} HumanMessage
 * @property {"human"} type - Identifies this as a human message
 * @property {Object} data - The message data
 * @property {string} data.message - The text content of the human message
 * @property {Object} [data.details] - Optional additional metadata about the message
 */

/**
 * A response message from the AI agent
 * @typedef {Object} AgentMessage
 * @property {"agent"} type - Identifies this as an agent message
 * @property {Object} data - The agent's response data
 * @property {boolean} [data.done] - Indicates if the agent has completed its current task
 * @property {Object} [data.result] - The final result object if the task is complete
 * @property {string} [data.message] - The text content of the agent's response
 * @property {Array<Object>} [data.learnings] - New information or insights the agent has gained
 * @property {string} [data.issue] - Description of any issues or errors encountered
 * @property {Array<Object>} [data.invocations] - List of tool/function invocations made by the agent
 */

/**
 * Results from function/tool invocations made by the agent
 * @typedef {Object} InvocationResultMessage
 * @property {"invocation-result"} type - Identifies this as an invocation result
 * @property {Object} data - The invocation result data
 * @property {string} data.id - Unique identifier for the invocation
 * @property {Object} data.result - The result returned by the invoked function/tool
 */

/**
 * React hook for managing and filtering conversation messages.
 * Provides utility functions for working with different message types and sorting messages.
 *
 * @param messages - Array of messages from the conversation
 * @returns Object containing utility functions for message management
 *
 * @example
 * ```tsx
 * // Basic usage
 * const { all, getOfType } = useMessages(messages);
 *
 * // Get all messages in descending order (newest first)
 * const allMessages = all("desc");
 *
 * // Get only human messages
 * const humanMessages = getOfType("human");
 *
 * @example
 * ```tsx
 * // Working with specific message types
 * const { getOfType } = useMessages(messages);
 *
 * // Get agent messages
 * const agentMessages = getOfType("agent");
 * agentMessages.forEach(msg => {
 *   if (msg.data.done) {
 *     console.log("Task completed:", msg.data.result);
 *   }
 * });
 *
 * // Get invocation results
 * const results = getOfType("invocation-result");
 * results.forEach(msg => {
 *   console.log(`Invocation ${msg.data.id}:`, msg.data.result);
 * });
 * ```
 */
export const useMessages = (messages?: RunTimelineMessages) => {
  return {
    /**
     * Returns all messages sorted by their ID
     * @param sort - Sort direction for messages
     * @param {"asc" | "desc"} [sort="desc"] - "asc" for oldest first, "desc" for newest first
     * @returns Sorted array of all messages
     */
    all: (sort: "asc" | "desc" = "desc") =>
      messages?.sort((a, b) =>
        sort === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)
      ),
    /**
     * Filters messages to return only those of a specific type
     * @param type - The message type to filter by ("human", "agent", or "invocation-result")
     * @returns Array of messages matching the specified type
     */
    getOfType: (type: RunTimelineMessages[number]["type"]) =>
      messages?.filter(message => message.type === type),
  };
};
