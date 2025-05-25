// Cron implementation using BullMQ Job Schedulers

import { Queue, Worker } from "bullmq";
import { logger } from "../observability/logger";
import { bullmqRedisConnection } from "../queues/core";
import { env } from "../../utilities/env";

const CRON_QUEUE_PREFIX = "cron-queue-";
const crons: {
  queue: Queue;
  worker: Worker;
  interval: number;
  name: string;
}[] = [];

/**
 * Register a cron job with BullMQ. On failure, the job will be retried up to 3 times with a delay of 3 seconds between each attempt.
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
    { connection: bullmqRedisConnection },
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

export const start = async () => {
  const register = async () => {
    crons.forEach(async cron => {
      // Create a Job Scheduler that will produce jobs at the specified interval
      await cron.queue.upsertJobScheduler(
        `scheduler-${cron.name}`,
        { every: cron.interval }, // Repeat every 'interval' milliseconds
        {
          name: cron.name,
          data: {}, // Job data (empty in this case)
          opts: {
            backoff: 3,
            attempts: 3,
            removeOnFail: 1000,
          },
        },
      );
    });
  };

  await register();

  // Periodically re-register job schedulers.
  // This avoids problems caused by task shutdown cleaning up job schedulers.
  setInterval(
    register,
    5 * 60 * 1000,
    // 5 minutes
  );
};

export const stop = async () => {
  // Close all queues and remove job schedulers
  await Promise.all(
    crons.map(async cron => {
      await cron.worker.close();

      // Get all job schedulers for this queue
      const schedulers = await cron.queue.getJobSchedulers();

      logger.info("Cleaning up job schedulers for queue", {
        name: cron.queue.name,
      });

      // Remove all job schedulers
      await Promise.all(
        schedulers
          .filter(
            scheduler => scheduler.id !== null && scheduler.id !== undefined,
          )
          .map(scheduler =>
            cron.queue.removeJobScheduler(scheduler.id as string),
          ),
      );

      await cron.queue.close();
      await cron.queue.obliterate({ force: true });
    }),
  );
};
