// Cron implementation using BullMQ Job Schedulers

import { Queue, Worker } from "bullmq";
import { logger } from "../observability/logger";
import { bullmqRedisConnection } from "../queues/core";
import { env } from "../../utilities/env";
import { createMutex } from "../data";

const CRON_QUEUE_PREFIX = "cron-queue-";
const crons: {
  queue: Queue;
  worker: Worker;
  interval: number;
  name: string;
}[] = [];

/**
 * Register a cron job with BullMQ.
 * It will keep the last 1000 failed jobs in the database for debugging purposes.
 *
 * @param fn - The function to execute
 * @param name - The name of the cron job
 * @param interval - The interval in milliseconds
 */
export const registerCron = async (
  fn: () => Promise<unknown>,
  name: string,
  { interval }: { interval: number },
) => {
  if (!env.ENABLE_QUEUE_INGESTION) {
    logger.info("Skipping registerCron. ENABLE_QUEUE_INGESTION is disabled.");
    return;
  }

  const queueName = `${CRON_QUEUE_PREFIX}${name}`;

  // Create a queue for the cron job
  const queue = new Queue(queueName, {
    connection: bullmqRedisConnection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });

  // Create a worker to process the jobs
  const worker = new Worker(
    queueName,
    async () => {
      try {
        await fn();
      } catch (e) {
        logger.error("Cron job failed", { name, error: e });
      }
    },
    {
      connection: bullmqRedisConnection,
      lockDuration: 60_000,
    },
  );

  worker.on("closed", () => {
    logger.warn("Worker closed", { name });
  });

  worker.on("failed", (job, err) => {
    logger.error("Job failed", { name, jobId: job?.id, error: err });
  });

  worker.on("error", err => {
    logger.error("Job error", { name, error: err });
  });

  worker.on("stalled", jobId => {
    logger.warn("Job stalled", { name, jobId });
  });

  worker.on("active", job => {
    logger.debug("Worker picked up job", { name, jobId: job.id });
  });

  crons.push({ queue, worker, interval, name });

  logger.info("Cron job registered with BullMQ Job Scheduler", {
    name,
    interval,
  });
};

const mutex = createMutex("cron-scheduler");
export const start = async () => {
  const unlock = await mutex.tryLock();

  if (!unlock) {
    logger.info("Could not acquire lock, skipping cron scheduler.");
    return;
  }

  try {
    for (const cron of crons) {
      // Create a Job Scheduler that will produce jobs at the specified interval
      await cron.queue.upsertJobScheduler(
        `scheduler-${cron.name}`,
        { every: cron.interval }, // Repeat every 'interval' milliseconds
        {
          name: cron.name,
          data: {}, // Job data (empty in this case)
          opts: {
            removeOnFail: 1000,
          },
        },
      );
    }

  } finally {
    await unlock();
  }
};
