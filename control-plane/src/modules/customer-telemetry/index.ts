import { z } from "zod";
import {
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
} from "../integrations/integration-events";
import {
  flushCluster,
  processModelCall,
  processRunFeedback,
  processToolCall,
} from "../integrations/langfuse";
import { logger } from "../observability/logger";

const eventSchema = z.discriminatedUnion("type", [
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
]);

export async function handleCustomerTelemetry(message: unknown) {
  const zodResult = eventSchema.safeParse(message);

  if (!zodResult.success) {
    logger.error("Message does not conform to customer telemetry schema", {
      error: zodResult.error,
      body: message,
    });
    return;
  }

  const event = zodResult.data;

  try {
    switch (event.type) {
      case "modelCall":
        await processModelCall(event);
        break;
      case "runFeedback":
        await processRunFeedback(event);
        break;
      case "toolCall":
        await processToolCall(event);
        break;
    }

    await flushCluster(event.clusterId);
  } catch (error) {
    logger.error("Error processing customer telemetry event", {
      error,
      event,
    });
  }
}
