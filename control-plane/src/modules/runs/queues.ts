import { env } from "../../utilities/env";
import { createMutex, db, runs } from "../data";
import { logger } from "../observability/logger";
import { baseMessageSchema, sqs, withObservability } from "../sqs";
import { getRun } from "./";
import { processRun } from "./agent/run";
import { generateTitle } from "./summarization";

import { and, eq } from "drizzle-orm";
import { Consumer } from "sqs-consumer";
import { z } from "zod";
import { injectTraceContext } from "../observability/tracer";
import { getRunTags } from "./tags";

const runProcessConsumer = Consumer.create({
  queueUrl: env.SQS_RUN_PROCESS_QUEUE_URL,
  batchSize: 5,
  visibilityTimeout: 180,
  heartbeatInterval: 30,
  handleMessage: withObservability(env.SQS_RUN_PROCESS_QUEUE_URL, handleRunProcess),
  sqs,
});

const runGenerateNameConsumer = Consumer.create({
  queueUrl: env.SQS_RUN_GENERATE_NAME_QUEUE_URL,
  batchSize: 5,
  visibilityTimeout: 30,
  heartbeatInterval: 15,
  handleMessage: withObservability(env.SQS_RUN_GENERATE_NAME_QUEUE_URL, handleRunNameGeneration),
  sqs,
});

export const start = async () => {
  await Promise.all([runProcessConsumer.start(), runGenerateNameConsumer.start()]);
};

export const stop = async () => {
  runProcessConsumer.stop();
  runGenerateNameConsumer.stop();
};

const MAX_PROCESS_LOCK_ATTEMPTS = 5;
async function handleRunProcess(message: unknown) {
  const zodResult = baseMessageSchema
    .extend({
      lockAttempts: z.number().default(0),
    })
    .safeParse(message);

  if (!zodResult.success) {
    logger.error("Message does not conform to run process schema", {
      error: zodResult.error,
      body: message,
    });
    return;
  }

  const { runId, clusterId, lockAttempts } = zodResult.data;

  const unlock = await createMutex(`run-process-${runId}`).tryLock();

  if (!unlock) {
    logger.info("Could not acquire run process lock");
    if (lockAttempts < MAX_PROCESS_LOCK_ATTEMPTS) {
      const delay = Math.pow(5, lockAttempts);

      const sqsResult = await sqs.sendMessage({
        QueueUrl: env.SQS_RUN_PROCESS_QUEUE_URL,
        DelaySeconds: delay,
        MessageBody: JSON.stringify({
          runId,
          clusterId,
          lockAttempts: lockAttempts + 1,
          ...injectTraceContext(),
        }),
      });

      logger.info("Will attempt to process after delay", {
        delay,
        lockAttempts,
        nextAttemptMessageId: sqsResult.MessageId,
      });
    } else {
      logger.warn("Could not acquire run process lock after multiple attempts, skipping", {
        lockAttempts,
      });
    }
    return;
  }

  try {
    const [run, tags] = await Promise.all([
      getRun({ clusterId, runId }),
      getRunTags({ clusterId, runId }),
    ]);

    if (!run) {
      logger.error("Received job for unknown Run");
      return;
    }

    await processRun(run, tags);
  } finally {
    await unlock();
  }
}

async function handleRunNameGeneration(message: unknown) {
  const zodResult = baseMessageSchema
    .extend({
      content: z.string(),
    })
    .safeParse(message);

  if (!zodResult.success) {
    logger.error("Message does not conform to name generation schema", {
      error: zodResult.error,
      body: message,
    });
    return;
  }

  const { runId, clusterId, content } = zodResult.data;

  const run = await getRun({ clusterId, runId });

  if (run.name) {
    return;
  }

  const unlock = await createMutex(`run-generate-name-${runId}`).tryLock();

  if (!unlock) {
    logger.warn("Could not acquire name generation lock, skipping");
    return;
  }

  try {
    logger.info("Running name generation job");

    const result = await generateTitle(content, run);

    if (result.summary) {
      await db
        .update(runs)
        .set({ name: result.summary })
        .where(and(eq(runs.id, runId), eq(runs.cluster_id, clusterId)));
    }
  } finally {
    await unlock();
  }
}
