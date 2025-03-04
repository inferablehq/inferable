import Langfuse from "langfuse";
import NodeCache from "node-cache";
import { z } from "zod";
import { createCache } from "../../utilities/cache";
import {
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
} from "./integration-events";
import { getIntegrations } from "./integrations";
import { integrationSchema } from "../contract";
import { CustomerTelemetryListeners } from "../customer-telemetry";
import { logger } from "../observability/logger";

const langfuseCache = new NodeCache({
  maxKeys: 100,
});

const integrationsCache = createCache<z.infer<typeof integrationSchema>>(
  Symbol("langfuseIntegrations"),
);

export async function getLangfuseClient(clusterId: string) {
  const cachedClient = langfuseCache.get<{
    client: Langfuse;
    sendMessagePayloads: boolean;
  }>(clusterId);
  if (cachedClient) {
    return cachedClient;
  }

  let integrations = await integrationsCache.get(clusterId);

  if (!integrations) {
    integrations = await getIntegrations({
      clusterId,
    });

    integrationsCache.set(clusterId, integrations, 60);
  }

  if (!integrations.langfuse) {
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

  const trace = langfuse?.client.trace({
    id: event.runId,
    name: `run:${event.runId}`,
  });

  trace?.generation({
    name: event.purpose ?? "model_call.generic",
    startTime: new Date(event.startedAt),
    endTime: new Date(event.completedAt),
    model: event.model,
    modelParameters: {
      temperature: event.temperature,
    },
    input: langfuse?.sendMessagePayloads ? event.input : undefined,
    output: langfuse?.sendMessagePayloads ? event.output : undefined,
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

  langfuse?.client.score({
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

  langfuse?.client.span({
    name: `${event.toolName}()`,
    startTime: new Date(event.startedAt),
    endTime: new Date(event.completedAt),
    traceId: event.runId,
    input: langfuse.sendMessagePayloads ? event.input : undefined,
    output: langfuse.sendMessagePayloads ? event.output : undefined,
    level: event.level,
  });
}

export const start = () => {
  CustomerTelemetryListeners.addListener(async (data) => {
    if (data.type === "modelCall") {
      await processModelCall(data);
    } else if (data.type === "runFeedback") {
      await processRunFeedback(data);
    } else if (data.type === "toolCall") {
      await processToolCall(data);
    } else {
      logger.error(
        "Received customer telemetry message that does not conform to expected schema",
        {
          message: data,
        },
      );
    }

    flushCluster(data.clusterId);
  });
};
