import { App, KnownEventFromType, webApi } from "@slack/bolt";
import { FastifySlackReceiver } from "./receiver";
import { env } from "../../utilities/env";
import { FastifyInstance } from "fastify";
import { logger } from "../observability/logger";
import { getRunsByMetadata } from "../workflows/metadata";
import { addMessageAndResume, createRunWithMessage, Run } from "../workflows/workflows";
import { AuthenticationError } from "../../utilities/errors";
import { ulid } from "ulid";
import { InferSelectModel } from "drizzle-orm";
import { workflowMessages } from "../data";

let app: App | undefined;

const THREAD_META_KEY = "slackThreadTs";
const CHANNEL_META_KEY = "slackChannel";

type MessageEvent = {
  event: KnownEventFromType<"message">;
  client: webApi.WebClient;
  clusterId: string;
};

export const handleNewRunMessage = async ({
  message,
  metadata,
  client = app?.client,
}: {
  message: {
    id: string;
    clusterId: string;
    runId: string;
    type: InferSelectModel<typeof workflowMessages>["type"];
    data: InferSelectModel<typeof workflowMessages>["data"];
  };
  metadata?: Record<string, string>;
  client?: webApi.WebClient;
}) => {
  if (message.type !== "agent") {
    return;
  }

  if (!metadata?.[THREAD_META_KEY] || !metadata?.[CHANNEL_META_KEY]) {
    return;
  }

  if ("message" in message.data && message.data.message) {
    client?.chat.postMessage({
      thread_ts: metadata[THREAD_META_KEY],
      channel: metadata[CHANNEL_META_KEY],
      mrkdwn: true,
      text: message.data.message,
    });
  } else {
    logger.warn("Slack initialted message does not have content");
  }
};

export const start = async (fastify: FastifyInstance) => {
  const SLACK_CLUSTER_ID = env.SLACK_CLUSTER_ID;
  const SLACK_BOT_TOKEN = env.SLACK_BOT_TOKEN;
  const SLACK_SIGNING_SECRET = env.SLACK_SIGNING_SECRET;

  if (!SLACK_CLUSTER_ID || !SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET) {
    logger.info("Missing Slack environment variables. Skipping Slack integration.");
    return;
  }

  app = new App({
    token: env.SLACK_BOT_TOKEN,
    receiver: new FastifySlackReceiver({
      signingSecret: SLACK_SIGNING_SECRET,
      path: "/triggers/slack",
      fastify,
    }),
  });

  // Event listener for mentions
  app.event("app_mention", async ({ event, client }) => {
    logger.info("Received mention event. Responding.", event);

    client.chat.postMessage({
      thread_ts: event.ts,
      channel: event.channel,
      mrkdwn: true,
      text: "Hey! Currently, I can only respond to direct messages.",
    });
  });

  // Event listener for direct messages
  app.event("message", async ({ event, client }) => {
    logger.info("Received message event. Responding.", event);

    if (isBotMessage(event)) {
      logger.info("Received message from bot. Ignoring.", event);
      return;
    }

    if (!isDirectMessage(event)) {
      logger.info("Received message from channel. Ignoring.", event);
      return;
    }

    try {
      await authenticateUser({
        event,
        client,
      });

      if (hasThread(event)) {
        await handleExistingThread({
          event,
          client,
          clusterId: SLACK_CLUSTER_ID,
        });
      } else {
        await handleNewThread({
          event,
          client,
          clusterId: SLACK_CLUSTER_ID,
        });
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        client.chat.postMessage({
          thread_ts: event.ts,
          channel: event.channel,
          text: `Sorry, I am having trouble authenticating you.\n\nPlease ensure your Inferable account has access to cluster <${env.APP_ORIGIN}/clusters/${SLACK_CLUSTER_ID}|${SLACK_CLUSTER_ID}>.`,
        });
        return;
      }

      logger.error("Error responding to Direct Message", { error });
    }
  });

  await app.start();
};

export const stop = async () => await app?.stop();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasThread = (e: any): e is { thread_ts: string } => {
  return typeof e?.thread_ts === "string";
};

const hasUser = (e: any): e is { user: string } => {
  return typeof e?.user === "string";
};

const isDirectMessage = (e: KnownEventFromType<"message">): boolean => {
  return e.channel_type === "im";
};

const isBotMessage = (e: KnownEventFromType<"message">): boolean => {
  return e.subtype === "bot_message";
};

const handleNewThread = async ({ event, client, clusterId }: MessageEvent) => {
  let thread = event.ts;
  // If this message is part of a thread, associate the run with the thread rather than the message
  if (hasThread(event)) {
    thread = event.thread_ts;
  }

  if ("text" in event && event.text) {
    const run = await createRunWithMessage({
      clusterId,
      message: event.text,
      type: "human",
      metadata: {
        [THREAD_META_KEY]: thread,
        [CHANNEL_META_KEY]: event.channel,
      },
    });

    client.chat.postMessage({
      thread_ts: thread,
      channel: event.channel,
      mrkdwn: true,
      text: `On it. I will get back to you soon.\nRun ID: <${env.APP_ORIGIN}/clusters/${clusterId}/runs/${run.id}|${run.id}>`,
    });

    return;
  }

  throw new Error("Event had no text");
};

const handleExistingThread = async ({ event, client, clusterId }: MessageEvent) => {
  if ("text" in event && event.text) {
    if (!hasThread(event)) {
      throw new Error("Event had no thread_ts");
    }

    const [run] = await getRunsByMetadata({
      clusterId,
      key: THREAD_META_KEY,
      value: event.thread_ts,
      limit: 1,
    });

    // Message is within a thread which already has a Run, continue
    if (run) {
      await addMessageAndResume({
        id: ulid(),
        clusterId: run.clusterId,
        runId: run.id,
        message: event.text,
        type: "human",
      });
    } else {
      // Message is in a thread, but does't have a Run, start a new one
      // TODO: Inferable doesn't have context for the original message, we should include this
      await handleNewThread({
        event,
        client,
        clusterId,
      });
    }

    return;
  }

  throw new Error("Event had no text");
};

export const authenticateUser = async ({
  event,
  client,
  authorizedUsers = env.SLACK_AUTHORIZED_USER_EMAILS ?? [],
}: {
  event: KnownEventFromType<"message">;
  client: webApi.WebClient;
  authorizedUsers?: string[];
}) => {
  if (hasUser(event)) {
    const user = await client.users.info({
      user: event.user,
      token: env.SLACK_BOT_TOKEN,
    });

    const confirmed = user.user?.is_email_confirmed;
    const email = user.user?.profile?.email;

    logger.info("Authenticated Slack user", { email, authorizedUsers });
    // TODO: Verify user in Clerk, for now check env
    if (!confirmed || !email || !authorizedUsers.includes(email)) {
      throw new AuthenticationError("Could not authenticate Slack user");
    }

    return true;
  }

  throw new Error("Event had no user");
};
