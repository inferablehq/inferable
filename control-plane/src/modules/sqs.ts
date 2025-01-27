import { Message, SQS } from "@aws-sdk/client-sqs";
import { env } from "../utilities/env";
import { extractTraceContext, withSpan } from "./observability/tracer";

import z from "zod";
import { logger } from "./observability/logger";
import { isRetryableError } from "../utilities/errors";
import { hdx } from "./observability/hyperdx";
import { safeParse } from "../utilities/safe-parse";

export const sqs = new SQS({
  endpoint: env.SQS_BASE_QUEUE_URL,
});

export const baseMessageSchema = z
  .object({
    clusterId: z.string(),
    runId: z.string(),
    traceparent: z.string().optional(),
    tracestate: z.string().optional(),
  })
  .passthrough();

export type BaseMessage = z.infer<typeof baseMessageSchema>;

export const withObservability =
  (queueUrl: string, fn: (message: unknown) => Promise<void>) => async (message: Message) => {
    const jsonResult = safeParse(message.Body);
    if (!jsonResult.success) {
      logger.error("Message body is not valid JSON", {
        error: jsonResult.error,
        body: message.Body,
      });
      return;
    }

    const zodResult = baseMessageSchema
      .extend({
        clusterId: z.string().optional(),
        runId: z.string().optional(),
      })
      .safeParse(jsonResult.data);

    if (!zodResult.success) {
      logger.error("Message body does conform to base schema", {
        error: zodResult.error,
        body: jsonResult.data,
      });
      return;
    }

    const data = zodResult.data;

    const attributes = {
      "deployment.version": env.VERSION,
      "cluster.id": data.clusterId,
      "run.id": data.runId,
      "sqs.queue.name": queueUrl.split("/").pop(),
      "sqs.message.id": message.MessageId,
      "sqs.message.receiveCount": message.Attributes?.ApproximateReceiveCount,
    };

    // Existing trace context propogated via the job data
    const existingTraceContext = extractTraceContext({
      traceparent: data.traceparent,
      tracestate: data.tracestate,
    });

    try {
      return await withSpan(
        "sqs.process",
        () => fn(data),
        {
          attributes,
        },
        existingTraceContext
      );
    } catch (e) {
      if (isRetryableError(e)) {
        logger.error("Job failed with retryable error", { error: e });
        throw e;
      }

      hdx?.recordException(e);

      logger.error("Job failed", { error: e, data });
    }
  };
