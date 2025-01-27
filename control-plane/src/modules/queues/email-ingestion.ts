import { createQueue, QueueNames } from ".";
import { BaseMessage } from "../sqs";
import { handleEmailIngestion } from "../email";

interface EmailIngestionMessage extends BaseMessage {
  content: string;
  notificationType: string;
  mail: {
    source: string;
    destination: string[];
  };
  receipt: {
    spamVerdict: { status: string };
    virusVerdict: { status: string };
    spfVerdict: { status: string };
    dkimVerdict: { status: string };
    dmarcVerdict: { status: string };
  };
}

export const emailIngestionQueue = createQueue<EmailIngestionMessage>(
  QueueNames.emailIngestionQueue,
  handleEmailIngestion,
  {
    concurrency: 5,
  }
);
