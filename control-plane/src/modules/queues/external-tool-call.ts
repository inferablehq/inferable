import { BaseMessage } from "../sqs";
import { handleExternalCall } from "../jobs/external";
import { createQueue } from "./core";
import { QueueNames } from "./core";

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
