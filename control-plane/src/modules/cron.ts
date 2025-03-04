// Cron implementation using BullMQ Job Schedulers

import { Queue, Worker } from "bullmq";
import { logger } from "./observability/logger";
import { bullmqRedisConnection } from "./queues/core";

// Store queues and workers for cleanup
const queues: Queue[] = [];
const workers: Worker[] = [];

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
  const queueName = `cron-queue-${name}`;

  // Create a queue for the cron job
  const queue = new Queue(queueName, { connection: bullmqRedisConnection });
  queues.push(queue);

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

  workers.push(worker);

  // Create a Job Scheduler that will produce jobs at the specified interval
  await queue.upsertJobScheduler(
    `scheduler-${name}`,
    { every: interval }, // Repeat every 'interval' milliseconds
    {
      name: name,
      data: {}, // Job data (empty in this case)
      opts: {
        backoff: 3,
        attempts: 3,
        removeOnFail: 1000,
      },
    },
  );

  logger.info("Cron job registered with BullMQ Job Scheduler", {
    name,
    interval,
  });
};

export const stop = async () => {
  // Close all workers
  await Promise.all(workers.map((worker) => worker.close()));

  // Close all queues and remove job schedulers
  await Promise.all(
    queues.map(async (queue) => {
      // Get all job schedulers for this queue
      const schedulers = await queue.getJobSchedulers();

      // Remove all job schedulers
      await Promise.all(
        schedulers
          .filter(
            (scheduler) => scheduler.id !== null && scheduler.id !== undefined,
          )
          .map((scheduler) => queue.removeJobScheduler(scheduler.id as string)),
      );

      await queue.obliterate({ force: true });
      await queue.close();
    }),
  );

  // Clear arrays
  workers.length = 0;
  queues.length = 0;
};
