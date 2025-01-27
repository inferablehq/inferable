import { z } from "zod";
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
import { BaseMessage } from "./sqs";

const eventSchema = z.discriminatedUnion("type", [
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
]);

export type CustomerTelemetryMessage = BaseMessage & z.infer<typeof eventSchema>;

export const handleCustomerTelemetry = async (data: CustomerTelemetryMessage): Promise<void> => {
  const zodResult = eventSchema.safeParse(data);

  if (!zodResult.success) {
    logger.error("Received customer telemetry message that does not conform to expected schema", {
      message: data,
    });
    return;
  }

  const event = zodResult.data;
  if (event.type === "modelCall") {
    await processModelCall(event);
  } else if (event.type === "runFeedback") {
    await processRunFeedback(event);
  } else if (event.type === "toolCall") {
    await processToolCall(event);
  } else {
    logger.error("Received customer telemetry message with unknown type", {
      message: data,
    });
  }

  await flushCluster(data.clusterId);
};
