import { createQueue, QueueNames } from ".";
import { BaseMessage } from "../sqs";
import { handleExternalCall } from "../jobs/external";

interface ExternalToolCallMessage extends BaseMessage {
  jobId: string;
  service: string;
}

export const externalToolCallQueue = createQueue<ExternalToolCallMessage>(
  QueueNames.externalToolCallQueue,
  handleExternalCall,
  {
    concurrency: 5,
  }
);
