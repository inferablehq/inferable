import { BaseMessage } from "../sqs";
import { z } from "zod";
import {
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
} from "../integrations/integration-events";
import { handleCustomerTelemetry } from "../customer-telemetry";
import { QueueNames } from "./core";
import { createQueue } from "./core";

const eventSchema = z.discriminatedUnion("type", [
  modelCallEventSchema,
  runFeedbackEventSchema,
  toolCallEventSchema,
]);

type CustomerTelemetryMessage = BaseMessage & z.infer<typeof eventSchema>;

export const customerTelemetryQueue = createQueue<CustomerTelemetryMessage>(
  QueueNames.customerTelemetryQueue,
  handleCustomerTelemetry,
  {
    concurrency: 10,
  }
);
