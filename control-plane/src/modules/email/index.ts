import { Consumer } from "sqs-consumer";
import { env } from "../../utilities/env";
import { sqs } from "../sqs";
import { z } from "zod";
import { Message } from "@aws-sdk/client-sqs";
import { logger } from "../observability/logger";
import { safeParse } from "../../utilities/safe-parse";

const sesMessageSchema = z.object({
  notificationType: z.string(),
  mail: z.object({
    timestamp: z.string().datetime(),
    source: z.string().email(),
    messageId: z.string(),
    destination: z.array(z.string().email()),
    headersTruncated: z.boolean(),
    headers: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    ),
    commonHeaders: z.object({
      returnPath: z.string().email(),
      from: z.array(z.string().email()),
      date: z.string(),
      to: z.array(z.string().email()),
      messageId: z.string(),
      subject: z.string(),
    }),
  }),
  receipt: z.object({
    timestamp: z.string().datetime(),
    processingTimeMillis: z.number(),
    recipients: z.array(z.string().email()),
    spamVerdict: z.object({ status: z.string() }),
    virusVerdict: z.object({ status: z.string() }),
    spfVerdict: z.object({ status: z.string() }),
    dkimVerdict: z.object({ status: z.string() }),
    dmarcVerdict: z.object({ status: z.string() }),
    action: z.object({
      type: z.string(),
      topicArn: z.string(),
      encoding: z.string(),
    }),
  }),
  content: z.string(),
})


const snsNotificationSchema = z.object({
  Type: z.literal("Notification"),
  MessageId: z.string(),
  TopicArn: z.string(),
  Subject: z.string(),
  Message: z.string(),
  Timestamp: z.string().datetime(),
  SignatureVersion: z.string(),
  Signature: z.string(),
  SigningCertURL: z.string().url(),
  UnsubscribeURL: z.string().url(),
});

const emailIngestionConsumer = env.SQS_EMAIL_INGESTION_QUEUE_URL
  ? Consumer.create({
      queueUrl: env.SQS_EMAIL_INGESTION_QUEUE_URL,
      batchSize: 5,
      visibilityTimeout: 60,
      heartbeatInterval: 30,
      handleMessage: handleEmailIngestion,
      sqs,
    })
  : undefined;

export const start = async () => {
  emailIngestionConsumer?.start()
};

export const stop = async () => {
  emailIngestionConsumer?.stop();
};

async function handleEmailIngestion(message: Message) {
  try {
    const notificationJson = safeParse(message.Body);
    if (!notificationJson.success) {
      logger.error("SNS notification is not valid JSON", {
        error: notificationJson.error,
      });
      return;
    }

    const notification = snsNotificationSchema.safeParse(notificationJson.data);
    if (!notification.success) {
      logger.error("Could not parse SNS notification", {
        error: notification.error,
      });
      return;
    }


    const sesJson = safeParse(notification.data.Message);
    if (!sesJson.success) {
      logger.error("SES message is not valid JSON", {
        error: sesJson.error,
      });
      return;
    }

    const sesMessage = sesMessageSchema.safeParse(sesJson.data);
    if (!sesMessage.success) {
      logger.error("Could not parse SES message", {
        error: sesMessage.error,
      });
      return;
    }

    logger.info("Ingesting email event", {
      messageId: sesMessage.data.mail.messageId,
      source: sesMessage.data.mail.source,
      destination: sesMessage.data.mail.destination,
      subject: sesMessage.data.mail.commonHeaders.subject,
    });


  } catch (error) {
    logger.error("Error while ingesting email event", {
      error,
    });
  }
}
