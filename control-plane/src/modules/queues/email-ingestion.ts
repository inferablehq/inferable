import { handleEmailIngestion } from "../email";
import { createQueue } from "./core";
import { QueueNames } from "./core";
import { BaseMessage } from "./observability";

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
