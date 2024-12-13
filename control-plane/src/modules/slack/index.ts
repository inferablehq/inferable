import { App } from '@slack/bolt';
import { FastifySlackReceiver } from './receiver';
import { env } from '../../utilities/env';
import { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger';

let app: App | undefined;

export const start = async (fastify: FastifyInstance) => {
  app = new App({
    token: env.SLACK_BOT_TOKEN,
    receiver: new FastifySlackReceiver({
      signingSecret: env.SLACK_SIGNING_SECRET,
      path: '/triggers/slack',
      fastify,
    })
  });

  app.event('app_mention', async ({ event }) => {
    logger.info("Received app_mention event. Skipping.", event);
  });

  // Event listener for direct messages
  app.event('message', async ({ event, client }) => {
    logger.info("Received message event. Responding.", event);
    try {
      if (event.channel_type === 'im' && event.subtype !== 'bot_message') {
        // Respond to the direct message
        await client.chat.postMessage({
          channel: event.channel,
          text: `Thanks for tagging me! Let's discuss here.`,
          thread_ts: event.ts, // Use the timestamp of the original message to create a thread
        });

      }
    } catch (error) {
      logger.error('Error responding to DM', { error });
    }
  });

  await app.start();
}

export const stop = async () => await app?.stop();
