import { Consumer } from "sqs-consumer";
import { env } from "../../utilities/env";
import { sqs, withObservability } from "../sqs";
import { z } from "zod";
import { logger } from "../observability/logger";
import { safeParse } from "../../utilities/safe-parse";
import { ParsedMail, simpleParser } from "mailparser";
import { getUserForCluster } from "../clerk";
import { AuthenticationError, NotFoundError } from "../../utilities/errors";
import { createRunWithMessage } from "../workflows/workflows";
import { flagsmith } from "../flagsmith";
import { InferSelectModel } from "drizzle-orm";
import { workflowMessages } from "../data";
import { ses } from "../ses";
import { getMessageByReference, insertRunMessage, updateMessageReference } from "../workflows/workflow-messages";
import { ulid } from "ulid";

const EMAIL_INIT_MESSAGE_ID_META_KEY = "emailInitMessageId";
const EMAIL_SUBJECT_META_KEY = "emailSubject";
const EMAIL_SOURCE_META_KEY = "emailSource";

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

export const handleNewRunMessage = async ({
  message,
  runMetadata,
}: {
  message: {
    id: string;
    clusterId: string;
    runId: string;
    type: InferSelectModel<typeof workflowMessages>["type"];
    data: InferSelectModel<typeof workflowMessages>["data"];

  };
  runMetadata?: Record<string, string>;
}) => {
  if (message.type !== "agent") {
    return;
  }

  if (!runMetadata?.[EMAIL_INIT_MESSAGE_ID_META_KEY] || !runMetadata?.[EMAIL_SUBJECT_META_KEY] || !runMetadata?.[EMAIL_SOURCE_META_KEY]) {
    return;
  }

  if ("message" in message.data && message.data.message) {
    const result = await ses.sendEmail({
      Source: `${message.clusterId}@${env.INFERABLE_EMAIL_DOMAIN}`,
      Destination: {
        ToAddresses: [
          runMetadata[EMAIL_SOURCE_META_KEY]
        ],
      },
      Message: {
        Subject: {
          Charset: "UTF-8",
          Data: `Re: ${runMetadata[EMAIL_SUBJECT_META_KEY]}`,
        },
        Body: {
          Text: {
            Charset: "UTF-8",
            Data: message.data.message,
          },
        },
      },
    })

    if (!result.MessageId) {
      throw new Error("SES did not return a message ID");
    }

    await updateMessageReference({
      clusterId: message.clusterId,
      messageId: message.id,
      externalReference: `<${result.MessageId}@email.amazonses.com>`,
    });

    logger.info("Email sent", {
      clusterId: message.clusterId,
      messageId: message.id,
    });

  } else {
    logger.warn("Email thread message does not have content");
  }
};

export async function parseMessage(message: unknown) {
  const notification = snsNotificationSchema.safeParse(message);
  if (!notification.success) {
    logger.error("Could not parse SNS notification message", {
      error: notification.error,
    })
    throw new Error("Could not parse SNS notification message");
  }

  const sesJson = safeParse(notification.data.Message);
  if (!sesJson.success) {
    throw new Error("SES message is not valid JSON");
  }

  const sesMessage = sesMessageSchema.safeParse(sesJson.data);
  if (!sesMessage.success) {
    logger.error("Could not parse SES message", {
      error: sesMessage.error,
    })
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
    subject: mail.subject,
    messageId: mail.messageId,
    source: sesMessage.data.mail.source,
    inReplyTo: mail.inReplyTo,
    references: (typeof mail.references === "string") ? [mail.references] : mail.references ?? [],
  }
}

async function handleEmailIngestion(raw: unknown) {
  const message = await parseMessage(raw);
  if (!message.body) {
    logger.info("Email had no body. Skipping", {
    });
    return;
  }

  if (!message.messageId) {
    logger.info("Email had no messageId. Skipping");
    return;
  }

  if (!message.subject) {
    logger.info("Email had no subject. Skipping");
    return;
  }

  const user = await authenticateUser(message.source, message.clusterId);

  const flags = await flagsmith?.getIdentityFlags(message.clusterId, {
    clusterId: message.clusterId,
  });

  const useEmail = flags?.isFeatureEnabled("experimental_email_trigger");

  if (!useEmail) {
    logger.info("Email trigger is disabled. Skipping", {
      clusterId: message.clusterId,
    });
    return;
  }

  const reference = message.inReplyTo || message.references[0];
  if (reference) {
    const existing = await getMessageByReference(reference, message.clusterId);
    if (!existing) {
      throw new NotFoundError("Ingested email is replying to an unknown message");
    }

    return await handleExistingChain({
      userId: user.id,
      body: message.body,
      clusterId: message.clusterId,
      messageId: message.messageId,
      runId: existing.runId
    });
  }

  await handleNewChain({
    userId: user.id,
    body: message.body,
    clusterId: message.clusterId,
    messageId: message.messageId,
    subject: message.subject,
    source: message.source
  });
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
  messageId,
  subject,
  source
}: {
  userId: string;
  body: string;
  clusterId: string;
  messageId: string;
  subject: string;
  source: string;
}) => {
  logger.info("Creating new run from email")
  await createRunWithMessage({
    userId,
    clusterId,
    metadata: {
      [EMAIL_INIT_MESSAGE_ID_META_KEY]: messageId,
      [EMAIL_SUBJECT_META_KEY]: subject,
      [EMAIL_SOURCE_META_KEY]: source,
    },
    messageMetadata: {
      displayable: {},
      externalReference: messageId,
    },
    message: body,
    type: "human",
  })
}

const handleExistingChain = async ({
  userId,
  body,
  clusterId,
  messageId,
  runId
}: {
  userId: string;
  body: string;
  clusterId: string;
  messageId: string;
  runId: string;
}) => {
  logger.info("Continuing existing run from email")
  await insertRunMessage({
    id: ulid(),
    clusterId,
    userId,
    runId,
    metadata: {
      displayable: {},
      externalReference: messageId,
    },
    data: {
      message: body
    },
    type: "human",
  })
}

