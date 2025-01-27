import { runProcessQueue } from "../queues/run-process";
import { runGenerateNameQueue } from "../queues/run-name-generation";

export { runProcessQueue, runGenerateNameQueue };

export const start = async () => {
  runProcessQueue.start();
  runGenerateNameQueue.start();
};

export const stop = async () => {
  runProcessQueue.stop();
  runGenerateNameQueue.stop();
};
