import { createQueue, QueueNames } from ".";
import { BaseMessage } from "../sqs";
import { handleRunNameGeneration } from "../runs/queues";

interface GenerateNameMessage extends BaseMessage {
  content: string;
}

export const runGenerateNameQueue = createQueue<GenerateNameMessage>(
  QueueNames.generateName,
  handleRunNameGeneration,
  {
    concurrency: 5,
  }
);
