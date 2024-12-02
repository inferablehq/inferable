import {
  Message,
  SendMessageBatchCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { Consumer } from "sqs-consumer";
import { z } from "zod";
import { env } from "../utilities/env";
import { logger } from "./observability/logger";
import { withSpan } from "./observability/tracer";
import { sqs } from "./sqs";
import crypto from "crypto";
import {
  flushCluster,
  processModelCall,
  processRunFeedback,
  processToolCall,
} from "./integrations/langfuse";
import { getIntegrations } from "./integrations/integrations";
import { createCache } from "../utilities/cache";
import {
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
} from "./integrations/integration-events";

const eventSchema = z.discriminatedUnion("type", [
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
]);

type ObservabilityEvent = z.infer<typeof eventSchema>;

const customerTelemetryEnabledCache = createCache(
  Symbol("customerTelemetryEnabled"),
);

async function hasCustomerTelemetryEnabled(clusterId: string) {
  const cached = await customerTelemetryEnabledCache.get(clusterId);

  if (cached === true || cached === false) {
    return cached;
  }

  const integrations = await getIntegrations({ clusterId });
  const enabled = !!integrations.langfuse;
  await customerTelemetryEnabledCache.set(clusterId, enabled, 60);

  return enabled;
}

async function sendToSQS(event: ObservabilityEvent) {
  if (!(await hasCustomerTelemetryEnabled(event.clusterId))) {
    return;
  }

  const queueUrl = env.SQS_CUSTOMER_TELEMETRY_QUEUE_URL;

  return await withSpan(
    "sqs.send_model_call_event",
    async () => {
      try {
        const command = new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            ...event,
            runId: event.runId,
          }),
          MessageAttributes: {
            eventType: {
              DataType: "String",
              StringValue: event.type,
            },
            data: {
              DataType: "String",
              StringValue: JSON.stringify(event),
            },
          },
        });

        const response = await sqs.send(command);
        return response;
      } catch (error) {
        logger.error("Error sending model call event to SQS", {
          error,
          event,
          queueUrl,
        });
        throw error;
      }
    },
    {
      attributes: {
        "cluster.id": event.clusterId,
        "run.id": event.runId,
        "sqs.queue.url": queueUrl,
      },
    },
  );
}

async function sendBatchToSQS(events: ObservabilityEvent[]) {
  if (
    events.some(
      async (event) => !(await hasCustomerTelemetryEnabled(event.clusterId)),
    )
  ) {
    return;
  }

  const queueUrl = env.SQS_CUSTOMER_TELEMETRY_QUEUE_URL;

  return await withSpan(
    "sqs.send_batch_events",
    async () => {
      try {
        // SQS batch requests are limited to 10 messages
        const batchSize = 10;
        const batches = [];

        for (let i = 0; i < events.length; i += batchSize) {
          const batch = events.slice(i, i + batchSize);
          const command = new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: batch.map((event) => ({
              Id: `${event.runId}-${event.type}-${crypto.randomUUID()}`,
              MessageBody: JSON.stringify({
                ...event,
                runId: event.runId,
              }),
              MessageAttributes: {
                eventType: {
                  DataType: "String",
                  StringValue: event.type,
                },
                data: {
                  DataType: "String",
                  StringValue: JSON.stringify(event),
                },
              },
            })),
          });

          batches.push(sqs.send(command));
        }

        const responses = await Promise.all(batches);
        return responses;
      } catch (error) {
        logger.error("Error sending batch events to SQS", {
          error,
          eventCount: events.length,
          queueUrl,
        });
        throw error;
      }
    },
    {
      attributes: {
        "sqs.queue.url": queueUrl,
        "batch.size": events.length,
      },
    },
  );
}

let consumer: Consumer | undefined;

const start = async () => {
  const customerTelemetryConsumer = env.SQS_CUSTOMER_TELEMETRY_QUEUE_URL
    ? Consumer.create({
        queueUrl: env.SQS_CUSTOMER_TELEMETRY_QUEUE_URL,
        batchSize: 10,
        visibilityTimeout: 60,
        heartbeatInterval: 30,
        handleMessageBatch: async (messages: Message[]): Promise<void> => {
          // Group messages by clusterId
          const messagesByCluster = new Map<string, Message[]>();

          for (const message of messages) {
            const data = JSON.parse(message.Body || "{}");
            const clusterId = data.clusterId;
            if (!clusterId) continue;

            const clusterMessages = messagesByCluster.get(clusterId) || [];
            clusterMessages.push(message);
            messagesByCluster.set(clusterId, clusterMessages);
          }

          // Process messages by cluster
          for (const [, clusterMessages] of messagesByCluster) {
            for (const message of clusterMessages) {
              const data = JSON.parse(message.Body || "{}");
              const zodResult = eventSchema.safeParse(data);

              if (!zodResult.success) {
                logger.error(
                  "Received customer telemetry message that does not conform to expected schema",
                  { message: data },
                );
                continue;
              }

              const event = zodResult.data;
              if (event.type === "modelCall") {
                await processModelCall(event);
              } else if (event.type === "runFeedback") {
                await processRunFeedback(event);
              } else if (event.type === "toolCall") {
                await processToolCall(event);
              } else {
                logger.error(
                  "Received customer telemetry message with unknown type",
                  {
                    message: data,
                  },
                );
              }
            }
          }

          await Promise.all(
            Array.from(messagesByCluster.keys()).map(flushCluster),
          );
        },
        sqs,
      })
    : undefined;

  consumer = customerTelemetryConsumer;

  customerTelemetryConsumer?.start();
};

export const stop = async () => {
  if (consumer) {
    consumer.stop();
  }
};

export const customerTelemetry = {
  track: sendToSQS,
  trackBatch: sendBatchToSQS,
  start,
  stop,
};
