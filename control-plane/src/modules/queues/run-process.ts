import { createQueue } from "./core";
import { QueueNames } from "./core";
import { createMutex } from "../data";
import { logger } from "../observability/logger";
import { assertEphemeralClusterLimitations, getRun } from "../runs";
import { processAgentRun } from "../runs/agent/run";
import { injectTraceContext } from "../observability/tracer";
import { z } from "zod";
import { BaseMessage, baseMessageSchema } from "./observability";

interface RunProcessMessage extends BaseMessage {
  lockAttempts?: number;
}

const MAX_PROCESS_LOCK_ATTEMPTS = 5;

export async function handleRunProcess(message: unknown) {
  const zodResult = baseMessageSchema
    .extend({
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

  const unlock = await createMutex(
    `run-process-${clusterId}-${runId}`,
  ).tryLock();

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
        },
      );

      logger.info("Will attempt to process after delay", {
        delay,
        lockAttempts,
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
    const [run] = await Promise.all([
      getRun({ clusterId, runId }),
      assertEphemeralClusterLimitations(clusterId),
    ]);

    if (!run) {
      logger.error("Received job for unknown Run");
      return;
    }

    await processAgentRun(run);
  } finally {
    await unlock();
  }
}

export const runProcessQueue = createQueue<RunProcessMessage>(
  QueueNames.runProcess,
  handleRunProcess,
  {
    concurrency: 5,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true,
    },
  },
);
