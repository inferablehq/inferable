// a naive cron implementation which will consume from a CDC later

import { createMutex } from "./data";
import { logger } from "./observability/logger";

const intervals: NodeJS.Timeout[] = [];

const currentLocks: Record<string, ReturnType<typeof createMutex>> = {};

export const registerCron = async (
  fn: () => Promise<unknown>,
  name: string,
  { interval }: { interval: number }
) => {
  const mutex = createMutex(`cron-${name}`);

  const intervalId = setInterval(async () => {
    const unlock = await mutex.tryLock();

    currentLocks[name] = mutex;

    if (!unlock) {
      logger.info("Could not acquire lock, skipping cron.", {
        queue: name,
      });
      return;
    }

    try {
      await fn();
    } catch (e) {
      logger.error("Cron job failed", { name, error: e });
    } finally {
      delete currentLocks[name];
      unlock();
    }
  }, interval);

  intervals.push(intervalId);

  logger.info("Cron job registered", { name, interval });
};

export const stop = () => {
  Object.values(currentLocks).forEach(mutex => {
    mutex.unlock();
  });

  intervals.forEach(intervalId => {
    clearInterval(intervalId);
  });
};
