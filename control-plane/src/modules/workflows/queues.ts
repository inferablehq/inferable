import { env } from "../../utilities/env";
import { createMutex } from "../data";
import { logger } from "../observability/logger";
import { BaseMessage, baseMessageSchema, sqs, withObservability } from "../sqs";
import { processRun } from "./agent/run";
import { generateTitle } from "./summarization";
import { getRun, updateWorkflow } from "./workflows";

import { Consumer } from "sqs-consumer";
import { z } from "zod";
import { injectTraceContext } from "../observability/tracer";
import { getRunMetadata } from "./metadata";

const runProcessConsumer = Consumer.create({
  queueUrl: env.SQS_RUN_PROCESS_QUEUE_URL,
  batchSize: 5,
  visibilityTimeout: 180,
  heartbeatInterval: 30,
  handleMessage: withObservability(
    env.SQS_RUN_PROCESS_QUEUE_URL,
    handleRunProcess,
  ),
  sqs,
});

const runGenerateNameConsumer = Consumer.create({
  queueUrl: env.SQS_RUN_GENERATE_NAME_QUEUE_URL,
  batchSize: 5,
  visibilityTimeout: 30,
  heartbeatInterval: 15,
  handleMessage: withObservability(
    env.SQS_RUN_GENERATE_NAME_QUEUE_URL,
    handleRunNameGeneration,
  ),
  sqs,
});

export const start = async () => {
  await Promise.all([
    runProcessConsumer.start(),
    runGenerateNameConsumer.start(),
  ]);
};

export const stop = async () => {
  runProcessConsumer.stop();
  runGenerateNameConsumer.stop();
};

const MAX_PROCESS_LOCK_ATTEMPTS = 5;
async function handleRunProcess(message: BaseMessage) {
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
      logger.warn(
        "Could not acquire run process lock after multiple attempts, skipping",
        {
          lockAttempts,
        },
      );
    }
    return;
  }

  try {
    const [run, metadata] = await Promise.all([
      getRun({ clusterId, runId }),
      getRunMetadata({ clusterId, runId }),
    ])

    if (!run) {
      logger.error("Received job for unknown workflow");
      return;
    }

    await processRun(run, metadata);
  } finally {
    await unlock();
  }
}

async function handleRunNameGeneration(message: BaseMessage) {
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

  const unlock = await createMutex(`run-generate-name-${runId}`).tryLock();

  if (!unlock) {
    logger.warn("Could not acquire name generation lock, skipping");
    return;
  }

  try {
    logger.info("Running name generation job");

    const workflow = await getRun({ clusterId, runId });

    const result = await generateTitle(content, workflow);

    if (result.summary) {
      await updateWorkflow({
        id: runId,
        clusterId,
        name: result.summary,
      });
    }
  } finally {
    await unlock();
  }
}
