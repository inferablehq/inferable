import { App, KnownEventFromType, webApi } from '@slack/bolt';
import { FastifySlackReceiver } from './receiver';
import { env } from '../../utilities/env';
import { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger';
import { getRunsByMetadata } from '../workflows/metadata';
import { addMessageAndResume, createRunWithMessage, Run } from '../workflows/workflows';
import { AuthenticationError } from '../../utilities/errors';
import { ulid } from 'ulid';

let app: App | undefined;

const THREAD_META_KEY = "stripeThreadTs";
const CHANNEL_META_KEY = "stripeChannel";

type MessageEvent = {
  event: KnownEventFromType<'message'>,
  client: webApi.WebClient
  clusterId: string
}

export const start = async (fastify: FastifyInstance) => {
  const SLACK_CLUSTER_ID = env.SLACK_CLUSTER_ID
  const SLACK_BOT_TOKEN = env.SLACK_BOT_TOKEN
  const SLACK_SIGNING_SECRET = env.SLACK_SIGNING_SECRET

  if (
    !SLACK_CLUSTER_ID ||
    !SLACK_BOT_TOKEN ||
    !SLACK_SIGNING_SECRET
  ) {
    logger.info("Missing Slack environment variables. Skipping Slack integration.");
    return
  }

  app = new App({
    token: env.SLACK_BOT_TOKEN,
    receiver: new FastifySlackReceiver({
      signingSecret: SLACK_SIGNING_SECRET,
      path: '/triggers/slack',
      fastify,
    })
  });

  // Event listener for direct messages
  app.event('message', async ({ event, client }) => {
    logger.info("Received message event. Responding.", event);

    if (isBotMessage(event)) {
      logger.info("Received message from bot. Ignoring.", event);
      return
    }

    if (!isDirectMessage(event)) {
      logger.info("Received message from channel. Ignoring.", event);
      return
    }

    try {
      await authenticateUser(event, client);

      if (hasThread(event)) {
        const [run] = await getRunsByMetadata({
          clusterId: SLACK_CLUSTER_ID,
          key: THREAD_META_KEY,
          value: event.thread_ts,
          limit: 1,
        });

        if (run)  {
          await handleExistingThread({
            event,
            client,
            run,
            clusterId: SLACK_CLUSTER_ID
          });
          return
        }
      }

      await handleNewThread({
        event,
        client,
        clusterId: SLACK_CLUSTER_ID
      });

    } catch (error) {

      if (error instanceof AuthenticationError) {
        client.chat.postMessage({
          thread_ts: event.ts,
          channel: event.channel,
          text: "Sorry, I couldn't authenticate you. Please ensure you have an Inferable account with the same email as your Slack account."
        })
        return
      }

      logger.error('Error responding to Direct Message', { error });
    }
  });

  await app.start();
}

export const stop = async () => await app?.stop();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasThread = (e: any): e is { thread_ts: string } => {
  return typeof e?.thread_ts === 'string';
}

const hasUser = (e: any): e is { user: string } => {
  return typeof e?.user === 'string';
}

const isDirectMessage = (e: KnownEventFromType<'message'>): boolean => {
  return e.channel_type === 'im';
}

const isBotMessage = (e: KnownEventFromType<'message'>): boolean => {
  return e.subtype === 'bot_message';
}

const handleNewThread = async ({
  event,
  client,
  clusterId
}: MessageEvent) => {

  if ('text' in event && event.text) {
    const run = await createRunWithMessage({
      clusterId,
      message: event.text,
      type: "human",
      metadata: {
        [THREAD_META_KEY]: event.ts,
        [CHANNEL_META_KEY]: event.channel
      },
    });

    client.chat.postMessage({
      thread_ts: event.ts,
      channel: event.channel,
      mrkdwn: true,
      text: `On it. I will get back to you soon.\nRun ID: <${env.APP_ORIGIN}/clusters/${clusterId}/runs/${run.id}|${run.id}>`,
    });
    return;
  }

  throw new Error("Event had no text");
}

const handleExistingThread = async ({
  event,
  run,
} : MessageEvent & { run: Run }) => {
  if ('text' in event && event.text) {
    await addMessageAndResume({
      id: ulid(),
      clusterId: run.clusterId,
      runId: run.id,
      message: event.text,
      type: "human",
    })
    return
  }

  throw new Error("Event had no text")
}

const authenticateUser = async (event: KnownEventFromType<'message'>, client: webApi.WebClient) => {
  if (hasUser(event)) {
    const user = await client.users.info({
      user: event.user,
      token: env.SLACK_BOT_TOKEN
    })

    const confirmed = user.user?.is_email_confirmed
    const email = user.user?.profile?.email

    if (!confirmed || !email) {
      throw new AuthenticationError('Could not authenticate Slack user')
    }

    // TODO: Verify user in Clerk
    return
  }

  throw new Error("Event had no user")
}

