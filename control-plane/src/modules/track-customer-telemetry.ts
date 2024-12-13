import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { env } from "../utilities/env";
import { logger } from "./observability/logger";
import { withSpan } from "./observability/tracer";
import { sqs } from "./sqs";
import { z } from "zod";
import {
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
} from "./integrations/integration-events";

type ObservabilityEvent = z.infer<
  | typeof modelCallEventSchema
  | typeof runFeedbackEventSchema
  | typeof toolCallEventSchema
>;

export async function trackCustomerTelemetry(event: ObservabilityEvent) {
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
