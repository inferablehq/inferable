import { Consumer } from "sqs-consumer";
import { env } from "../../utilities/env";
import { sqs, withObservability } from "../sqs";
import { z } from "zod";
import { logger } from "../observability/logger";
import { safeParse } from "../../utilities/safe-parse";
import { ParsedMail, simpleParser } from "mailparser";
import { getUserForCluster } from "../clerk";
import { AuthenticationError } from "../../utilities/errors";
import { addMessageAndResume, createRunWithMessage } from "../runs";
import { InferSelectModel, sql } from "drizzle-orm";
import { db, integrations, runMessages } from "../data";
import { ses } from "../ses";
import { ulid } from "ulid";
import { unifiedMessageSchema } from "../contract";
import { createExternalMessage, getExternalMessage } from "../runs/external-messages";
import { getAgent, mergeAgentOptions } from "../agents";
import { getIntegrations } from "../integrations/integrations";

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

  const integrations = await getIntegrations({ clusterId: message.clusterId });
  if (!integrations.email) {
    logger.info("No email integration configured. Skipping email notification.", {
      messageId: message.id,
    });
    return;
  }

  const messageData = unifiedMessageSchema.parse(message).data;

  if ("message" in messageData && messageData.message) {

    const originalMessageId = tags[EMAIL_INIT_MESSAGE_ID_META_KEY];
    const fromEmail = `"Inferable" <${message.clusterId}@${env.INFERABLE_EMAIL_DOMAIN}>`;
    const toEmail = tags[EMAIL_SOURCE_META_KEY];
    const subject = `Re: ${tags[EMAIL_SUBJECT_META_KEY]}`;
    const bodyText = messageData.message;

    const result = await sendEmail({
      fromEmail,
      toEmail,
      subject,
      originalMessageId,
      bodyText,
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
    logger.warn("Email thread message does not have content", {
      messageId: message.id,
    });
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
    throw new Error("Could not parse email body content");
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
    dkimVerdict: sesMessage.data.receipt.dkimVerdict.status,
    spfVerdict: sesMessage.data.receipt.spfVerdict.status,
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

  const connection = await integrationByConnectionId(message.connectionId);

  if (!connection) {
    logger.info("Could not find connection for email. Skipping")
    return
  }

  if (message.dkimVerdict !== "PASS" || message.spfVerdict !== "PASS") {
    if (connection?.email?.validateSPFandDKIM) {
      logger.info("Email did not pass DKIM or SPF checks. Skipping.", {
        messageId: message.messageId,
      });

      await sendEmail({
        fromEmail: `${message.connectionId}@${env.INFERABLE_EMAIL_DOMAIN}`,
        toEmail: message.source,
        subject: "Inferable email ingestion failed",
        bodyText: "Email did not pass DKIM or SPF checks.\n\nPlease see the https://docs.inferable.ai/pages/email for more information.",
        originalMessageId: message.messageId,
      })
      return;
    }
  }

  const clusterId = connection.clusterId;
  const agentId = connection.email?.agentId;


  let user: Awaited<ReturnType<typeof authenticateUser>>;
  try {
    user = await authenticateUser(message.source, clusterId);
  } catch (e) {
    logger.info("Could not authenticate email sender. Skipping.", {
      error: e,
    })

    await sendEmail({
      fromEmail: `${message.connectionId}@${env.INFERABLE_EMAIL_DOMAIN}`,
      toEmail: message.source,
      subject: "Inferable email ingestion failed",
      bodyText: "Could not authenticate email sender.\n\nPlease see the https://docs.inferable.ai/pages/email for more information.",
      originalMessageId: message.messageId,
    })
    return
  }

  const reference = message.inReplyTo || message.references[0];
  if (reference) {
    const existing = await getExternalMessage({
      clusterId: clusterId,
      externalId: reference,
    });
    if (!existing) {
      logger.info("Could not find Run for email chain. Skipping.")

      await sendEmail({
        fromEmail: `${message.connectionId}@${env.INFERABLE_EMAIL_DOMAIN}`,
        toEmail: message.source,
        subject: "Inferable email ingestion failed",
        bodyText: "Could not find Run for email chain.\n\nPlease see https://docs.inferable.ai/pages/email for more information.",
        originalMessageId: message.messageId,
      })
      return
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
    subject: message.subject ?? "",
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

  let options;

  if (agentId) {
    const agent = await getAgent({
      id: agentId,
      clusterId,
    });
    if (!agent) {
      throw new Error("Could not find agent for email");
    }
    options = mergeAgentOptions({}, agent);
  }

  if (options?.error) {
    logger.error("Could not merge agent options", {
      error: options.error,
    })
  }

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
    ...options?.options
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
      clusterId: integrations.cluster_id,
      email: integrations.email,
    })
    .from(integrations)
    .where(sql`email->>'connectionId' = ${connectionId}`);

  return result;
};

const sendEmail = async ({
  fromEmail,
  toEmail,
  subject,
  originalMessageId,
  bodyText,
}: {
  fromEmail: string;
  toEmail: string;
  subject: string;
  originalMessageId?: string;
  bodyText: string;
}) => {
  // MIME formatted email
  const messageParts = [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
  ]

  if (originalMessageId) {
    messageParts.push(`In-Reply-To: ${originalMessageId}`);
    messageParts.push(`References: ${originalMessageId}`);
  }

  messageParts.push(``)
  messageParts.push(bodyText)

  // Send the raw email
  return await ses.sendRawEmail({
    RawMessage: {
      Data: Buffer.from(messageParts.join("\r\n")),
    },
  });
};
