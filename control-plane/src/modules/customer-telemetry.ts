import { Message } from "@aws-sdk/client-sqs";
import { Consumer } from "sqs-consumer";
import { z } from "zod";
import { env } from "../utilities/env";
import {
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
} from "./integrations/integration-events";
import {
  flushCluster,
  processModelCall,
  processRunFeedback,
  processToolCall,
} from "./integrations/langfuse";
import { logger } from "./observability/logger";
import { sqs } from "./sqs";

const eventSchema = z.discriminatedUnion("type", [
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
]);
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
  start,
  stop,
};
