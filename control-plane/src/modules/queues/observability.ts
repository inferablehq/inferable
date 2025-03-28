import { z } from "zod";
import { logger } from "../observability/logger";
import { extractTraceContext, withSpan } from "../observability/tracer";
import { isRetryableError } from "../../utilities/errors";
import { hdx } from "../observability/hyperdx";
import { env } from "../../utilities/env";
import { Job, Processor } from "bullmq";

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
  <T>(queueName: string, fn: (message: T) => Promise<void>): Processor<T> => async (job: Job<T>) => {
    const zodResult = baseMessageSchema.safeParse(job.data);

    if (!zodResult.success) {
      logger.error("Could not parse job data", {
        error: zodResult.error,
        body: job,
      });
      return;
    }

    const parsed = zodResult.data;

    const attributes = {
      "deployment.version": env.VERSION,
      "cluster.id": parsed.clusterId,
      "run.id": parsed.runId,
      "queue.name": queueName,
      "queue.job.id": job.id,
      "queue.job.attemptsMade": job.attemptsMade
    };

    // Existing trace context propogated via the job data
    const existingTraceContext = extractTraceContext({
      traceparent: parsed.traceparent,
      tracestate: parsed.tracestate,
    });

    try {
      return await withSpan(
        "bull.process",
        () => fn(job.data),
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

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      hdx?.recordException(e);

      logger.error("Job failed", { error: e, data: job });
    }
  };
