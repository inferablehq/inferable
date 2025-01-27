import { createMutex, db, runs } from "../data";
import { logger } from "../observability/logger";
import { baseMessageSchema } from "../sqs";
import { getRun } from "./";
import { processRun } from "./agent/run";
import { generateTitle } from "./summarization";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { injectTraceContext } from "../observability/tracer";
import { createQueue, QueueNames } from "../queues";
import { getRunTags } from "./tags";

export const runProcessQueue = createQueue<{
  runId: string;
  clusterId: string;
  lockAttempts?: number;
}>(QueueNames.runProcess, handleRunProcess, {
  concurrency: 5,
});

export const start = async () => {
  runProcessQueue.start();
};

export const stop = async () => {
  runProcessQueue.stop();
};

const MAX_PROCESS_LOCK_ATTEMPTS = 5;
export async function handleRunProcess(message: unknown) {
  const zodResult = baseMessageSchema
    .extend({
      runId: z.string(),
      lockAttempts: z.number().optional(),
    })
    .safeParse(message);

  if (!zodResult.success) {
    logger.error("Message does not conform to run process schema", {
      error: zodResult.error,
      body: message,
    });
    return;
  }

  const { runId, clusterId, lockAttempts = 0 } = zodResult.data;

  const unlock = await createMutex(`run-process-${runId}`).tryLock();

  if (!unlock) {
    logger.info("Could not acquire run process lock");
    if (lockAttempts < MAX_PROCESS_LOCK_ATTEMPTS) {
      const delay = Math.pow(5, lockAttempts);

      await runProcessQueue.send(
        {
          runId,
          clusterId,
          lockAttempts: lockAttempts + 1,
          ...injectTraceContext(),
        },
        {
          delay: delay * 1000,
        }
      );

      logger.info("Will attempt to process after delay", {
        delay,
        lockAttempts,
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

export async function handleRunNameGeneration(message: unknown) {
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
