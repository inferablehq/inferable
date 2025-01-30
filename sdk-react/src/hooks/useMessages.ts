import { z } from "zod";
import { RunTimelineMessages } from "./useRun";
import React, { useState } from "react";

type RunTimelineMessage = RunTimelineMessages[number];
type ToolSchemas = Record<string, z.ZodTypeAny>;

type KnownInvocationResultMessages<TSchemas extends ToolSchemas> = {
  [K in keyof TSchemas]: {
    id: string;
    type: "invocation-result";
    data: {
      toolName: K;
      /** The parsed shape of the schema for K */
      result: z.infer<TSchemas[K]>;
    };
  };
}[keyof TSchemas];

// Add a new type for untyped invocation results
type UntypedInvocationResultMessage = {
  id: string;
  type: "invocation-result";
  data: {
    toolName: string;
    result: unknown;
  };
};

// All RunTimelineMessage that are not type.invocation-results
type NonInvocationTimelineMessage = Exclude<RunTimelineMessage, { type: "invocation-result" }>;

// Update ParsedMessage to handle both cases
type ParsedMessage<TSchemas extends ToolSchemas> = NonInvocationTimelineMessage |
  (TSchemas extends Record<string, never>
    ? UntypedInvocationResultMessage
    : KnownInvocationResultMessages<TSchemas>);

/**
 * Options for the useMessages hook
 * Accept a map of toolName -> Zod schema
 */
interface UseMessagesOptions<TSchemas extends ToolSchemas = {}> {
  /**
   * Record of tool name to Zod schema. If a message has a matching toolName,
   * we'll parse and narrow its result type accordingly.
   */
  resultMap?: TSchemas;
}

interface UseMessagesReturn<TSchemas extends ToolSchemas> {
  /**
   * Returns all messages sorted by their ID
   * @param {"asc" | "desc"} [sort="desc"] - "asc" for oldest first, "desc" for newest first
   */
  all: (sort: "asc" | "desc") => ParsedMessage<TSchemas>[];
  /**
   * Filters messages to return only those of a specific type
   * @param type - The message type to filter by ("human", "agent", or "invocation-result")
   */
  getOfType: (type: RunTimelineMessage["type"]) => ParsedMessage<TSchemas>[];

  /** Error object if any errors occurred during the session */
  error: Error | null;
}

/**
 * Safely parses a single message:
 * - If message.type !== 'invocation-result', return it unchanged
 * - If message.type === 'invocation-result' and we have a matching tool schema,
 *   return a typed version if parse succeeds; otherwise return fallback untyped
 */
function parseMessage<TSchemas extends ToolSchemas>(
  message: RunTimelineMessage,
  schemas?: TSchemas
): ParsedMessage<TSchemas> | null {
  // Only relevant for invocation-result messages
  if (message.type !== "invocation-result") {
    // Human or agent => pass through unchanged
    return message as ParsedMessage<TSchemas>;
  }

  const { toolName, result } = message.data;
  if (toolName && schemas && toolName in schemas) {
    const schema = schemas[toolName];
    const parsed = schema.safeParse(result);

    if (!parsed.success) {
      throw new Error(`Failed to parse result for ${toolName}: ${parsed.error}`);
    }

    // Return typed invocation-result message
    return {
      ...message,
      data: {
        toolName,
        result: parsed.data,
      },
    } as ParsedMessage<TSchemas>;
  }

  return null;
}

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
 * @property {string} data.toolName - The name of the invoked function/tool
 * @property {Object} data.result - The result returned by the invoked function/tool
 */

/**
 * React hook for managing and filtering conversation messages,
 * returning *typed* invocation-result messages when possible.
 *
 * @param messages - Array of messages from the conversation
 * @param options - Provide a resultMap to parse tool results
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
export function useMessages<
  TSchemas extends ToolSchemas = {}
>(
  messages?: RunTimelineMessages,
  options?: UseMessagesOptions<TSchemas>
): UseMessagesReturn<TSchemas> {
  const [error, setError] = useState<Error | null>(null);

  const parse = React.useCallback(
    (msg: RunTimelineMessage) => {
      try {
        return parseMessage(msg, options?.resultMap)
      } catch (e) {
        if (e instanceof Error && e.message !== error?.message) {
          setError(e)
        }
        return msg
      }
    },
    [options?.resultMap, error]
  );

  return {
    all: (sort: "asc" | "desc" = "desc"): ParsedMessage<TSchemas>[] => {
      if (!messages) return [];
      return messages
        .map(parse)
        .filter((m): m is ParsedMessage<TSchemas> => m !== null)
        .sort((a, b) =>
          sort === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)
        );
    },

    getOfType: (
      type: RunTimelineMessage["type"]
    ): ParsedMessage<TSchemas>[] => {
      if (!messages) return [];
      return messages
        .map(parse)
        .filter((m): m is ParsedMessage<TSchemas> => m !== null)
        .filter((m) => m.type === type);
    },

    error,
  }
}
