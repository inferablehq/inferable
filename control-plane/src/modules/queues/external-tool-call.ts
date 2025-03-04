import { handleExternalCall } from "../jobs/external";
import { createQueue } from "./core";
import { QueueNames } from "./core";
import { BaseMessage } from "./observability";

interface ExternalToolCallMessage extends BaseMessage {
  jobId: string;
  service: string;
}

export const externalToolCallQueue = createQueue<ExternalToolCallMessage>(
  QueueNames.externalToolCallQueue,
  handleExternalCall,
  {
    concurrency: 5,
  },
);
