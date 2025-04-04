import { ulid } from "ulid";
import {
  AgentError,
  InvalidJobArgumentsError,
} from "../../../../utilities/errors";
import * as events from "../../../observability/events";
import { logger } from "../../../observability/logger";
import { addAttributes, withSpan } from "../../../observability/tracer";
import { AgentMessage, assertMessageOfType } from "../../messages";
import { ToolFetcher } from "../agent";
import { RunGraphState } from "../state";
import { SpecialResultTypes, parseFunctionResponse } from "../tools/functions";
import { AgentTool, AgentToolInputError } from "../tool";
import { trackCustomerTelemetry } from "../../../customer-telemetry/track";

export const TOOL_CALL_NODE_NAME = "action";

export const handleToolCalls = (state: RunGraphState, getTool: ToolFetcher) =>
  withSpan("run.toolCalls", () => _handleToolCalls(state, getTool));

const _handleToolCalls = async (
  state: RunGraphState,
  getTool: ToolFetcher,
): Promise<Partial<RunGraphState>> => {
  // When we recieve parallel tool calls, we will receive a number of ToolMessage's
  // after the last AIMessage (The actual function call).
  // We need to find the last non-function message to handle the tool call.
  let lastIndex = state.messages.length - 1;
  let lastMessage = state.messages[lastIndex];

  const resolvedToolsCalls = new Set<string>();
  while (lastMessage.type === "invocation-result") {
    logger.info(
      "Found invocation-result message, finding last non-invocation message",
      {
        toolCallId: lastMessage.data.id,
      },
    );

    // Keep track of the tool calls which have already resolved
    resolvedToolsCalls.add(lastMessage.data.id);

    lastIndex--;

    const message = state.messages[lastIndex];

    if (!message) {
      throw new AgentError("Could not find non-function result message");
    }

    lastMessage = message;
  }

  const agentMessage = assertMessageOfType("agent", lastMessage);

  if (
    !agentMessage.data.invocations ||
    agentMessage.data.invocations.length === 0
  ) {
    logger.error("Expected a tool call", { lastMessage });
    throw new AgentError("Expected a tool call");
  }

  const toolResults = await Promise.all(
    agentMessage.data.invocations
      // Filter out any tool_calls which have already resolvedd
      .filter(toolCall => !resolvedToolsCalls.has(toolCall.id ?? ""))
      .map(toolCall => handleToolCall(toolCall, state.run, getTool)),
  );

  return toolResults.reduce(
    (acc, result) => {
      if (result.messages) acc.messages!.push(...result.messages);
      if (result.waitingJobs) acc.waitingJobs!.push(...result.waitingJobs);
      if (result.result) {
        if (!!acc.result && !!result.result && result.result !== acc.result) {
          logger.error(
            "Multiple tools returned different results. Last one will be used.",
            {
              result,
              accResult: acc.result,
            },
          );
        }

        acc.result = result.result;
      }
      if (result.status) acc.status = result.status;
      return acc;
    },
    {
      messages: [],
      waitingJobs: [],
      status: "running",
      result: undefined,
    },
  );
};

const handleToolCall = (
  toolCall: Required<AgentMessage["data"]>["invocations"][number],
  run: {
    id: string;
    clusterId: string;
    resultSchema: unknown | null;
    debug: boolean;
  },
  getTool: ToolFetcher,
) =>
  withSpan("run.toolCall", () => _handleToolCall(toolCall, run, getTool), {
    attributes: {
      "tool.name": toolCall.toolName,
      "tool.call.id": toolCall.id,
    },
  });

const _handleToolCall = async (
  toolCall: Required<AgentMessage["data"]>["invocations"][number],
  run: {
    id: string;
    clusterId: string;
    resultSchema: unknown | null;
    debug: boolean;
  },
  getTool: ToolFetcher,
): Promise<Partial<RunGraphState>> => {
  logger.info("Executing tool call");

  let tool: AgentTool | undefined;

  const toolName = toolCall.toolName;
  const toolInput = toolCall.input;
  const toolCallId = toolCall.id;

  if (!toolCallId) {
    throw new Error("Missing tool call ID");
  }

  if (run.debug) {
    addAttributes({
      "tool.call.args": JSON.stringify(toolInput),
    });
  }

  const startedAt = Date.now();

  try {
    tool = await getTool(toolCall);
  } catch (error) {
    await trackCustomerTelemetry({
      type: "toolCall",
      toolName,
      clusterId: run.clusterId,
      runId: run.id,
      input: toolInput,
      output: error,
      level: "ERROR",
      startedAt,
      completedAt: Date.now(),
    });

    return {
      messages: [
        {
          id: ulid(),
          type: "invocation-result" as const,
          data: {
            resultType: "rejection",
            result: {
              message: `Failed to find tool: ${toolName}. This might mean that the service that provides this tool is down. Human must be prompted to ask the devs whether to tool "toolName" is connected.`,
              error,
            },
            id: toolCallId,
            toolName,
          },
          runId: run.id,
          clusterId: run.clusterId,
          createdAt: new Date(),
        },
      ],
    };
  }

  events.write({
    type: "toolInvocationCreated",
    clusterId: run.clusterId,
    runId: run.id,
    toolName,
    meta: {
      toolInput: JSON.stringify(toolInput),
    },
  });

  try {
    const rawResponse = await tool.execute(toolInput);
    if (!rawResponse) {
      throw new AgentError("Received empty response from tool executor");
    }
    const response = parseFunctionResponse(rawResponse);

    if (run.debug) {
      addAttributes({
        "tool.response.result": JSON.stringify(response),
      });
    }

    const stateUpdate = await handleSpecialResults({
      response,
    });
    if (stateUpdate) {
      return stateUpdate;
    }

    if (response.resultType === "rejection") {
      events.write({
        type: "toolInvocationFailed",
        clusterId: run.clusterId,
        runId: run.id,
        meta: {
          log: `Failed to invoke ${toolName}`,
          error: response,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      trackCustomerTelemetry({
        type: "toolCall",
        toolName,
        clusterId: run.clusterId,
        runId: run.id,
        input: toolInput,
        output: response,
        startedAt,
        completedAt: Date.now(),
        level: "WARNING",
      });

      return {
        messages: [
          {
            id: ulid(),
            type: "invocation-result",
            data: {
              resultType: "rejection",
              result: {
                [toolCallId]: response,
              },
              toolName,
              id: toolCallId,
            },
            runId: run.id,
            clusterId: run.clusterId,
            createdAt: new Date(),
          },
        ],
      };
    }

    if (response.resultType === "resolution") {
      events.write({
        type: "toolInvocationResulted",
        clusterId: run.clusterId,
        runId: run.id,
        meta: {
          log: `Failed to invoke ${toolName}`,
          error: response,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      trackCustomerTelemetry({
        type: "toolCall",
        toolName,
        clusterId: run.clusterId,
        runId: run.id,
        input: toolInput,
        output: response,
        startedAt,
        completedAt: Date.now(),
        level: "DEFAULT",
      });

      return {
        messages: [
          {
            id: ulid(),
            type: "invocation-result",
            data: {
              resultType: "resolution",
              result: {
                [toolCallId]: response,
              },
              toolName,
              id: toolCallId,
            },
            runId: run.id,
            clusterId: run.clusterId,
            createdAt: new Date(),
          },
        ],
      };
    }

    logger.error("Unknown result type encountered", {
      response,
    });

    throw new AgentError("Unknown result type encountered");
  } catch (error) {
    if (error instanceof AgentToolInputError) {
      events.write({
        type: "toolInvocationFailed",
        clusterId: run.clusterId,
        runId: run.id,
        meta: {
          log: `Failed to parse tool input for ${toolName}`,
        },
      });

      logger.info("Agent provided invalid tool input", {
        error,
        toolName,
      });

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      trackCustomerTelemetry({
        type: "toolCall",
        toolName,
        clusterId: run.clusterId,
        runId: run.id,
        input: toolInput,
        startedAt,
        completedAt: Date.now(),
        level: "ERROR",
      });

      return {
        messages: [
          {
            id: ulid(),
            type: "invocation-result",
            data: {
              resultType: "rejection",
              result: {
                message: `Provided input did not match schema for ${toolName}, check your input`,
                parseResult: error.validatorResult.errors,
              },
              toolName,
              id: toolCallId,
            },
            runId: run.id,
            clusterId: run.clusterId,
            createdAt: new Date(),
          },
        ],
      };
    }

    if (error instanceof InvalidJobArgumentsError) {
      events.write({
        type: "toolInvocationFailed",
        clusterId: run.clusterId,
        runId: run.id,
        meta: {
          log: `Invalid job arguments for ${toolName}`,
        },
      });
    }

    logger.error("Failed to invoke tool", {
      error,
      toolName,
    });

    await trackCustomerTelemetry({
      type: "toolCall",
      toolName,
      clusterId: run.clusterId,
      runId: run.id,
      input: toolInput,
      output: error,
      startedAt,
      completedAt: Date.now(),
      level: "ERROR",
    });

    return {
      messages: [
        {
          id: ulid(),
          type: "invocation-result",
          data: {
            resultType: "rejection",
            result: {
              message: `Failed to invoke ${toolName}`,
              error,
            },
            toolName,
            id: toolCallId,
          },
          runId: run.id,
          clusterId: run.clusterId,
          createdAt: new Date(),
        },
      ],
    };
  }
};

/**
 * Handle special result types which can cause the run to finish / pause early by returning a state update.
 */
const handleSpecialResults = async ({
  response,
}: {
  response: ReturnType<typeof parseFunctionResponse>;
}): Promise<Partial<RunGraphState> | void> => {
  // Handle special result types as these can cause the run to finish / pause
  if (response.resultType === SpecialResultTypes.jobTimeout) {
    const jobIds = response.result;
    return { status: "paused", waitingJobs: jobIds };
  }
  if (response.resultType === SpecialResultTypes.interrupt) {
    return { status: "paused" };
  }
};
