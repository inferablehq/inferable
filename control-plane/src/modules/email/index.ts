import { Consumer } from "sqs-consumer";
import { env } from "../../utilities/env";
import { BaseMessage, sqs, withObservability } from "../sqs";
import { z } from "zod";
import { logger } from "../observability/logger";
import { safeParse } from "../../utilities/safe-parse";
import { ParsedMail, simpleParser } from "mailparser";
import { getUserForCluster } from "../clerk";
import { AuthenticationError } from "../../utilities/errors";
import { createRunWithMessage } from "../workflows/workflows";

const sesMessageSchema = z.object({
  notificationType: z.string(),
  mail: z.object({
    timestamp: z.string(),
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
    timestamp: z.string(),
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
  Timestamp: z.string(),
  SignatureVersion: z.string(),
  Signature: z.string(),
  SigningCertURL: z.string(),
  UnsubscribeURL: z.string(),
});

const emailIngestionConsumer = env.SQS_EMAIL_INGESTION_QUEUE_URL
  ? Consumer.create({
      queueUrl: env.SQS_EMAIL_INGESTION_QUEUE_URL,
      batchSize: 5,
      visibilityTimeout: 60,
      heartbeatInterval: 30,
      handleMessage: withObservability(env.SQS_EMAIL_INGESTION_QUEUE_URL, handleEmailIngestion),
      sqs,
    })
  : undefined;

export const start = async () => {
  emailIngestionConsumer?.start()
};

export const stop = async () => {
  emailIngestionConsumer?.stop();
};

async function handleEmailIngestion(raw: unknown) {
  const message = await parseMessage(raw);
  if (!message.body) {
    logger.info("Email had no body. Skipping", {
    });
    return;
  }

  const user = await authenticateUser(message.source, message.clusterId);

  await handleNewChain({
    userId: user.id,
    body: message.body,
    clusterId: message.clusterId
  });
}

export async function parseMessage(message: unknown) {
  const notification = snsNotificationSchema.safeParse(message);
  if (!notification.success) {
    throw new Error("Could not parse SNS notification message");
  }

  const sesJson = safeParse(notification.data.Message);
  if (!sesJson.success) {
    throw new Error("SES message is not valid JSON");
  }

  const sesMessage = sesMessageSchema.safeParse(sesJson.data);
  if (!sesMessage.success) {
    throw new Error("Could not parse SES message");
  }

  const ingestionAddresses = sesMessage.data.mail.destination.filter(
    (email) => email.endsWith(env.INFERABLE_EMAIL_DOMAIN)
  )

  if (ingestionAddresses.length > 1) {
    throw new Error("Found multiple Inferable email addresses in destination");
  }

  const clusterId = ingestionAddresses.pop()?.replace(env.INFERABLE_EMAIL_DOMAIN, "").replace("@", "");

  if (!clusterId) {
    throw new Error("Could not extract clusterId from email address");
  }

  const mail = await parseMailContent(sesMessage.data.content);
  if (!mail) {
    throw new Error("Could not parse email content");
  }

  let body = mail.text
  if (!body && mail.html) {
    body = mail.html
  }

  return {
    body,
    clusterId,
    ingestionAddresses,
    source: sesMessage.data.mail.source,
    messageId: sesMessage.data.mail.messageId,
  }
}

const parseMailContent = (message: string):  Promise<ParsedMail> => {
  return new Promise((resolve, reject) => {
    simpleParser(message, (error, parsed) => {
      if (error) {
        reject(error);
      } else {
        resolve(parsed);
      }
    });
  })
};


const authenticateUser = async (emailAddress: string, clusterId: string) => {
  if (!env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY must be set for email authentication");
  }

  const clerkUser = await getUserForCluster({
    emailAddress,
    clusterId,
  });

  if (!clerkUser) {
    logger.info("Could not find Email in Clerk.", {
      emailAddress,
    });
    throw new AuthenticationError("Could not authenticate Email sender");
  }

  return clerkUser;
};

const handleNewChain = async ({
  userId,
  body,
  clusterId,
}: {
  userId: string;
  body: string;
  clusterId: string;
}) => {
  await createRunWithMessage({
    userId,
    clusterId,
    message: body,
    type: "human",
  })
}

