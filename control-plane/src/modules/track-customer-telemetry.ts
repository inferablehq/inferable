import { z } from "zod";
import {
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
} from "./integrations/integration-events";
import { logger } from "./observability/logger";
import { withSpan } from "./observability/tracer";
import { customerTelemetryQueue } from "./queues/customer-telemetry";

type ObservabilityEvent = z.infer<
  typeof modelCallEventSchema | typeof runFeedbackEventSchema | typeof toolCallEventSchema
>;

export async function trackCustomerTelemetry(event: ObservabilityEvent) {
  return withSpan(
    "queue.send_customer_telemetry",
    async () => {
      try {
        await customerTelemetryQueue.send({
          ...event,
          runId: event.runId,
        });
      } catch (error) {
        logger.error("Error sending customer telemetry event to queue", {
          error,
          event,
        });
        throw error;
      }
    },
    {
      attributes: {
        "cluster.id": event.clusterId,
        "run.id": event.runId,
      },
    }
  ).catch(error => {
    logger.warn("Error sending customer telemetry event to queue", {
      error,
      event,
    });
  });
}
