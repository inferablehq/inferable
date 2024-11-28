import Langfuse from "langfuse";
import NodeCache from "node-cache";
import { logger } from "../observability/logger";
import { getIntegrations } from "./integrations";
import { z } from "zod";
import {
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
} from "./integration-events";

const langfuseCache = new NodeCache({
  maxKeys: 100,
});

export async function getLangfuseClient(clusterId: string) {
  const cachedClient = langfuseCache.get<{
    client: Langfuse;
    sendMessagePayloads: boolean;
  }>(clusterId);
  if (cachedClient) {
    return cachedClient;
  }

  const integrations = await getIntegrations({
    clusterId,
  });

  if (!integrations.langfuse) {
    logger.error("No Langfuse integration found", { clusterId });
    return;
  }

  const langfuse = new Langfuse({
    secretKey: integrations.langfuse.secretKey,
    publicKey: integrations.langfuse.publicKey,
    baseUrl: integrations.langfuse.baseUrl,
  });

  langfuseCache.set(
    clusterId,
    {
      client: langfuse,
      sendMessagePayloads: integrations.langfuse.sendMessagePayloads,
    },
    60,
  ); // Cache for 1 minute

  return {
    client: langfuse,
    sendMessagePayloads: integrations.langfuse.sendMessagePayloads,
  };
}

export async function flushCluster(clusterId: string) {
  const cachedClient = langfuseCache.get<{
    client: Langfuse;
    sendMessagePayloads: boolean;
  }>(clusterId);
  if (cachedClient) {
    await cachedClient.client.flushAsync();
  }
}

export async function processModelCall(
  event: z.infer<typeof modelCallEventSchema>,
) {
  const langfuse = await getLangfuseClient(event.clusterId);
  if (!langfuse) {
    logger.error("No Langfuse client found", { event });

    return;
  }

  const trace = langfuse.client.trace({
    id: event.runId,
    name: `run:${event.runId}`,
  });

  trace.generation({
    name: event.purpose ?? "model_call.generic",
    startTime: new Date(event.startedAt),
    endTime: new Date(event.completedAt),
    model: event.model,
    modelParameters: {
      temperature: event.temperature,
    },
    input: langfuse.sendMessagePayloads ? event.input : undefined,
    output: langfuse.sendMessagePayloads ? event.output : undefined,
    usage: {
      promptTokens: event.inputTokens,
      completionTokens: event.outputTokens,
    },
  });
}

export async function processRunFeedback(
  event: z.infer<typeof runFeedbackEventSchema>,
) {
  const langfuse = await getLangfuseClient(event.clusterId);
  if (!langfuse) {
    logger.error("No Langfuse client found", { event });

    return;
  }

  langfuse.client.score({
    traceId: event.runId,
    name: "user_feedback",
    value: event.score,
    comment: event.comment,
  });
}

export async function processToolCall(
  event: z.infer<typeof toolCallEventSchema>,
) {
  const langfuse = await getLangfuseClient(event.clusterId);

  if (!langfuse) {
    logger.error("No Langfuse client found", { event });

    return;
  }

  langfuse.client.span({
    name: `${event.toolName}()`,
    startTime: new Date(event.startedAt),
    endTime: new Date(event.completedAt),
    traceId: event.runId,
    input: langfuse.sendMessagePayloads ? event.input : undefined,
    output: langfuse.sendMessagePayloads ? event.output : undefined,
    level: event.level,
  });
}
