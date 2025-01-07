import { Consumer } from "sqs-consumer";
import { env } from "../../utilities/env";
import { sqs, withObservability } from "../sqs";
import { z } from "zod";
import { logger } from "../observability/logger";
import { safeParse } from "../../utilities/safe-parse";
import { ParsedMail, simpleParser } from "mailparser";
import { getUserForCluster } from "../clerk";
import { AuthenticationError, NotFoundError } from "../../utilities/errors";
import { addMessageAndResume, createRunWithMessage } from "../runs";
import { InferSelectModel, sql } from "drizzle-orm";
import { db, integrations, runMessages } from "../data";
import { ses } from "../ses";
import { ulid } from "ulid";
import { unifiedMessageSchema } from "../contract";
import { createExternalMessage, getExternalMessage } from "../runs/external-messages";

const EMAIL_INIT_MESSAGE_ID_META_KEY = "emailInitMessageId";
const EMAIL_SUBJECT_META_KEY = "emailSubject";
const EMAIL_SOURCE_META_KEY = "emailSource";

const sesMessageSchema = z.object({
  notificationType: z.string(),
  mail: z.object({
    source: z.string().email(),
    destination: z.array(z.string().email()),
  }),
  receipt: z.object({
    spamVerdict: z.object({ status: z.string() }),
    virusVerdict: z.object({ status: z.string() }),
    spfVerdict: z.object({ status: z.string() }),
    dkimVerdict: z.object({ status: z.string() }),
    dmarcVerdict: z.object({ status: z.string() }),
  }),
  content: z.string(),
});

const snsNotificationSchema = z.object({
  Type: z.literal("Notification"),
  MessageId: z.string(),
  Subject: z.string(),
  Message: z.string(),
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
  emailIngestionConsumer?.start();
};

export const stop = async () => {
  emailIngestionConsumer?.stop();
};

export const notifyNewMessage = async ({
  message,
  tags,
}: {
  message: {
    id: string;
    clusterId: string;
    runId: string;
    type: InferSelectModel<typeof runMessages>["type"];
    data: InferSelectModel<typeof runMessages>["data"];
  };
  tags?: Record<string, string>;
}) => {
  if (message.type !== "agent") {
    return;
  }

  if (
    !tags?.[EMAIL_INIT_MESSAGE_ID_META_KEY] ||
    !tags?.[EMAIL_SUBJECT_META_KEY] ||
    !tags?.[EMAIL_SOURCE_META_KEY]
  ) {
    return;
  }

  const messageData = unifiedMessageSchema.parse(message).data;

  if ("message" in messageData && messageData.message) {
    const result = await ses.sendEmail({
      Source: `"Inferable" <${message.clusterId}@${env.INFERABLE_EMAIL_DOMAIN}>`,
      Destination: {
        ToAddresses: [tags[EMAIL_SOURCE_META_KEY]],
      },
      Message: {
        Subject: {
          Charset: "UTF-8",
          Data: `Re: ${tags[EMAIL_SUBJECT_META_KEY]}`,
        },
        Body: {
          Text: {
            Charset: "UTF-8",
            Data: messageData.message,
          },
        },
      },
    });

    if (!result.MessageId) {
      throw new Error("SES did not return a message ID");
    }

    await createExternalMessage({
      channel: "email",
      externalId: `<${result.MessageId}@email.amazonses.com>`,
      messageId: message.id,
      clusterId: message.clusterId,
      runId: message.runId,
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
    });
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
    });
    throw new Error("Could not parse SES message");
  }

  const ingestionAddresses = sesMessage.data.mail.destination.filter(email =>
    email.endsWith(env.INFERABLE_EMAIL_DOMAIN)
  );

  if (ingestionAddresses.length > 1) {
    throw new Error("Found multiple Inferable email addresses in destination");
  }

  const connectionId = ingestionAddresses
    .pop()
    ?.replace(env.INFERABLE_EMAIL_DOMAIN, "")
    .replace("@", "");

  if (!connectionId) {
    throw new Error("Could not extract connectionId from email address");
  }

  const mail = await parseMailContent(sesMessage.data.content);
  if (!mail) {
    throw new Error("Could not parse email content");
  }

  let body = mail.text;
  if (!body && mail.html) {
    body = mail.html;
  }

  return {
    body: body ? stripQuoteTail(body) : undefined,
    connectionId,
    ingestionAddresses,
    subject: mail.subject,
    messageId: mail.messageId,
    source: sesMessage.data.mail.source,
    inReplyTo: mail.inReplyTo,
    references: typeof mail.references === "string" ? [mail.references] : (mail.references ?? []),
  };
}

// Strip trailing email chain quotes ">"
export const stripQuoteTail = (message: string) => {
  const lines = message.split("\n").reverse();

  while ((lines[0] && lines[0].startsWith(">")) || lines[0].trim() === "") {
    lines.shift();
  }

  return lines.reverse().join("\n");
};

async function handleEmailIngestion(raw: unknown) {
  const message = await parseMessage(raw);
  if (!message.body) {
    logger.info("Email had no body. Skipping", {});
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

  const connection = await integrationByConnectionId(message.connectionId);

  if (!connection) {
    throw new Error("Could not find connection");
  }

  const clusterId = connection.clusterId;
  let agentId: string | undefined;
  if (connection.destination.type == "agent") {
    agentId = connection.destination.id;
  }

  const user = await authenticateUser(message.source, clusterId);

  const reference = message.inReplyTo || message.references[0];
  if (reference) {
    const existing = await getExternalMessage({
      clusterId: clusterId,
      externalId: reference,
    });
    if (!existing) {
      throw new NotFoundError("Ingested email is replying to an unknown message");
    }

    return await handleExistingChain({
      clusterId,
      userId: user.userId,
      body: message.body,
      runId: existing.runId,
    });
  }

  await handleNewChain({
    agentId,
    clusterId,
    userId: user.userId,
    body: message.body,
    messageId: message.messageId,
    subject: message.subject,
    source: message.source,
  });
}

const parseMailContent = (message: string): Promise<ParsedMail> => {
  return new Promise((resolve, reject) => {
    simpleParser(message, (error, parsed) => {
      if (error) {
        reject(error);
      } else {
        resolve(parsed);
      }
    });
  });
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

  return {
    userId: `clerk:${clerkUser.id}`,
  };
};

const handleNewChain = async ({
  userId,
  body,
  clusterId,
  messageId,
  agentId,
  subject,
  source,
}: {
  userId: string;
  body: string;
  clusterId: string;
  messageId: string;
  agentId?: string;
  subject: string;
  source: string;
}) => {
  logger.info("Creating new run from email");
  await createRunWithMessage({
    userId,
    clusterId,
    agentId,
    tags: {
      [EMAIL_INIT_MESSAGE_ID_META_KEY]: messageId,
      [EMAIL_SUBJECT_META_KEY]: subject,
      [EMAIL_SOURCE_META_KEY]: source,
    },
    messageMetadata: {
      displayable: {
        via: "email"
      },
    },
    message: body,
    type: "human",
  });
};

const handleExistingChain = async ({
  userId,
  body,
  clusterId,
  runId,
}: {
  userId: string;
  body: string;
  clusterId: string;
  runId: string;
}) => {
  logger.info("Continuing existing run from email");
  await addMessageAndResume({
    id: ulid(),
    clusterId,
    userId,
    runId,
    metadata: {
      displayable: {
        via: "email"
      },
    },
    message: body,
    type: "human",
  });
};

export const integrationByConnectionId = async (connectionId: string) => {
  const [result] = await db
    .select({
      cluster_id: integrations.cluster_id,
      email: integrations.email,
    })
    .from(integrations)
    .where(sql`email->>'connections'::text LIKE '%' || ${connectionId} || '%'`);

  if (!result) {
    return undefined;
  }

  const connection = result.email?.connections.find(connection => connection.id === connectionId);

  if (!connection) {
    return undefined;
  }

  return {
    clusterId: result.cluster_id,
    ...connection
  }
};
