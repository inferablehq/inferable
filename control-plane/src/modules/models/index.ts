import AsyncRetry from "async-retry";
import { JsonSchema7Type } from "zod-to-json-schema";
import Anthropic from "@anthropic-ai/sdk";
import { ToolUseBlock } from "@anthropic-ai/sdk/resources";
import {
  ChatIdentifiers,
  CONTEXT_WINDOW,
  EmbeddingIdentifiers,
  getEmbeddingRouting,
  getRouting,
  isChatIdentifier,
  isEmbeddingIdentifier,
} from "./routing";
import { isRetryableError } from "../../utilities/errors";
import { logger } from "../observability/logger";
import * as events from "../observability/events";
import { rateLimiter } from "../rate-limiter";
import { addAttributes } from "../observability/tracer";
import { trackCustomerTelemetry } from "../track-customer-telemetry";

type CallInput = {
  system?: string | undefined;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  maxTokens?: number;
};

type CallOutput = {
  raw: Anthropic.Message;
};

type StructuredCallInput = CallInput & {
  schema: JsonSchema7Type;
};

type StructuredCallOutput = CallOutput & {
  structured: unknown;
};

export type Model = {
  call: (options: CallInput) => Promise<CallOutput>;
  structured: <T extends StructuredCallInput>(options: T) => Promise<StructuredCallOutput>;
  identifier: ChatIdentifiers | EmbeddingIdentifiers;
  contextWindow?: number;
  embedQuery: (input: string) => Promise<number[]>;
};

const perClusterRateLimiters = [
  rateLimiter({ window: "minute", ceiling: 200_000 * 4 }), // roughly 200k tokens per minute
  rateLimiter({ window: "hour", ceiling: 2_000_000 * 4 }), // roughly 2 million tokens per hour
];

export const buildModel = ({
  identifier,
  trackingOptions,
  modelOptions,
  purpose,
}: {
  identifier: ChatIdentifiers | EmbeddingIdentifiers;
  trackingOptions?: {
    clusterId?: string;
    runId?: string;
  };
  modelOptions?: {
    temperature?: number;
  };
  purpose?: string;
}): Model => {
  const temperature = modelOptions?.temperature ?? 0.5;

  return {
    identifier,
    contextWindow: CONTEXT_WINDOW[identifier],
    embedQuery: async (input: string) => {
      if (!isEmbeddingIdentifier(identifier)) {
        throw new Error(`${identifier} is not an embedding model`);
      }
      const routing = getEmbeddingRouting({
        identifier,
        index: 0,
      });

      if (!routing) {
        throw new Error("Could not get model routing");
      }

      return await routing.buildClient().embedQuery(input);
    },
    call: async (options: CallInput) => {
      if (!isChatIdentifier(identifier)) {
        throw new Error(`${identifier} is not a chat model`);
      }
      const response = await AsyncRetry(
        async (bail, attempt) => {
          const routing = getRouting({
            identifier,
            index: attempt - 1,
          });

          if (trackingOptions?.clusterId) {
            const clusterId = trackingOptions.clusterId;

            const allowed = await Promise.all(
              perClusterRateLimiters.map(r =>
                r.allowed(clusterId, Buffer.byteLength(JSON.stringify(options.messages)))
              )
            );

            if (!allowed.every(Boolean)) {
              logger.warn("Rate limit exceeded. (Just logged, not preventing request)", {
                modelId: routing.modelId,
                clusterId,
                allowed,
              });
            }
          }

          if (!routing) {
            bail(new Error("Could not get model routing"));
          }

          const tools = options.tools ?? [];

          try {
            const startedAt = Date.now();
            const response = await routing.buildClient().messages.create({
              model: routing.modelId,
              temperature,
              stream: false,
              max_tokens: options.maxTokens ?? 2048,
              system: options.system,
              messages: options.messages,
              // This is enforced above
              tools: tools as Anthropic.Tool[],
            });

            trackModelUsage({
              clusterId: trackingOptions?.clusterId,
              runId: trackingOptions?.runId,
              modelId: routing.modelId,
              systemPrompt: options.system,
              tools,
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              temperature,
              input: options.messages,
              output: response.content,
              startedAt,
              completedAt: Date.now(),
            });

            return response;
          } catch (error) {
            await handleErrror({
              bail,
              error,
              modelId: routing.modelId,
              attempt,
            });
          }
        },
        {
          retries: 5,
        }
      );

      if (!response) {
        throw new Error("Model did not return output");
      }

      return {
        raw: response,
      };
    },
    structured: async <T extends StructuredCallInput>(options: T) => {
      if (!isChatIdentifier(identifier)) {
        throw new Error(`${identifier} is not a chat model`);
      }

      const response = await AsyncRetry(
        async (bail, attempt) => {
          const routing = getRouting({
            identifier,
            index: attempt - 1,
          });

          if (!routing) {
            bail(new Error("Could not get model routing"));
          }

          const tools = options.tools ?? [];

          try {
            const startedAt = Date.now();
            const response = await routing.buildClient().messages.create({
              model: routing.modelId,
              temperature,
              stream: false,
              max_tokens: options.maxTokens ?? 2048,
              system: options.system,
              messages: options.messages,
              tool_choice: {
                type: "tool",
                name: "extract",
              },
              tools: [
                // This is enforced above
                ...(tools as Anthropic.Tool[]),
                {
                  input_schema: options.schema as Anthropic.Tool.InputSchema,
                  name: "extract",
                },
              ],
            });

            trackModelUsage({
              ...trackingOptions,
              modelId: routing.modelId,
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              temperature,
              input: options.messages,
              output: response.content,
              startedAt,
              completedAt: Date.now(),
              purpose,
            });

            return response;
          } catch (error) {
            await handleErrror({
              bail,
              error,
              modelId: routing.modelId,
              attempt,
            });
          }
        },
        {
          retries: 5,
        }
      );

      if (!response) {
        throw new Error("Model did not return output");
      }

      return parseStructuredResponse({ response });
    },
  };
};

const handleErrror = async ({
  bail,
  error,
  modelId,
  attempt,
}: {
  bail: (e: unknown) => void;
  error: unknown;
  modelId: string;
  attempt: number;
}) => {
  if (!isRetryableError(error)) {
    logger.error("Model call failed with non-retryable error", {
      modelId,
      attempt,
      error,
    });
    bail(error);
    return;
  }

  logger.warn("Model call failed with retryable error", {
    modelId,
    attempt,
    error,
  });

  await new Promise(resolve => setTimeout(resolve, attempt * 500));
  throw error;
};

const parseStructuredResponse = ({
  response,
}: {
  response: Anthropic.Message;
}): Awaited<ReturnType<Model["structured"]>> => {
  const toolCalls = response.content.filter(m => m.type === "tool_use");

  const extractResult = toolCalls.find(
    m => m.type === "tool_use" && m.name === "extract"
  ) as ToolUseBlock;
  if (!extractResult) {
    throw new Error("Model did not return structured output");
  }

  return {
    raw: response,
    structured: extractResult.input,
  };
};

export const buildMockModel = ({
  mockResponses,
  responseCount,
}: {
  mockResponses: string[];
  responseCount: number;
}): Model => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    identifier: "mock" as any,
    embedQuery: async () => {
      throw new Error("Not implemented");
    },
    call: async () => {
      throw new Error("Not implemented");
    },
    structured: async () => {
      if (responseCount >= mockResponses.length) {
        throw new Error("Mock model ran out of responses");
      }

      const data = JSON.parse(mockResponses[responseCount]);

      // Sleep for between 500 and 1500 ms
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

      return {
        raw: { content: [] } as unknown as Anthropic.Message,
        structured: data,
      };
    },
  };
};

const trackModelUsage = async ({
  runId,
  clusterId,
  modelId,
  inputTokens,
  outputTokens,
  temperature,
  input,
  output,
  startedAt,
  completedAt,
  purpose,
  systemPrompt,
  tools,
}: {
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  temperature: number;
  input: unknown;
  output: unknown;
  startedAt: number;
  completedAt: number;
  purpose?: string;
  clusterId?: string;
  runId?: string;
  systemPrompt?: string;
  tools?: Anthropic.Tool[];
}) => {
  if (!clusterId) {
    logger.warn("No cluster id provided, usage tracking will be skipped", {
      modelId,
      workflowId: runId,
    });
    return;
  }

  logger.info("Model usage", {
    modelId,
    inputTokens,
    outputTokens,
  });

  addAttributes({
    "model.input_tokens": inputTokens,
    "model.output_tokens": outputTokens,
  });

  events.write({
    type: "modelInvocation",
    clusterId: clusterId,
    workflowId: runId,
    tokenUsageInput: inputTokens,
    tokenUsageOutput: outputTokens,
    modelId,
    meta: {
      purpose,
      systemPrompt,
      input: input,
      output: output,
      temperature,
      tools,
    },
  });

  if (runId) {
    trackCustomerTelemetry({
      type: "modelCall",
      clusterId,
      runId,
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      model: modelId,
      temperature: temperature,
      startedAt,
      completedAt,
      input,
      output,
      purpose,
    });
  }
};
