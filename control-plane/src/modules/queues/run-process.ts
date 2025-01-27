import { createQueue, QueueNames } from ".";
import { BaseMessage } from "../sqs";
import { handleRunProcess } from "../runs/queues";

interface RunProcessMessage extends BaseMessage {
  runId: string;
  lockAttempts?: number;
}

export const runProcessQueue = createQueue<RunProcessMessage>(
  QueueNames.runProcessQueue,
  handleRunProcess,
  {
    concurrency: 5,
  }
);
