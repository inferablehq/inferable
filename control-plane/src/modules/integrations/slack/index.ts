import { App, BlockAction, KnownEventFromType, SlackAction, webApi } from "@slack/bolt";
import { FastifySlackReceiver } from "./receiver";
import { env } from "../../../utilities/env";
import { FastifyInstance } from "fastify";
import { logger } from "../../observability/logger";
import { getRunsByMetadata } from "../../workflows/metadata";
import { addMessageAndResume, createRunWithMessage } from "../../workflows/workflows";
import { AuthenticationError } from "../../../utilities/errors";
import { ulid } from "ulid";
import { and, eq, InferSelectModel, ne, sql } from "drizzle-orm";
import { db, integrations, workflowMessages } from "../../data";
import { nango } from "../nango";
import { InstallableIntegration } from "../types";
import { integrationSchema } from "../schema";
import { z } from "zod";
import { getUserForCluster } from "../../clerk";
import { submitApproval } from "../../jobs/jobs";

const THREAD_META_KEY = "slackThreadTs";
const CHANNEL_META_KEY = "slackChannel";

const CALL_APPROVE_ACTION_ID = "call_approve";
const CALL_DENY_ACTION_ID = "call_deny";

let app: App | undefined;

type MessageEvent = {
  event: KnownEventFromType<"message">;
  client: webApi.WebClient;
  clusterId: string;
  userId?: string;
};

export const slack: InstallableIntegration = {
  name: "slack",
  onDeactivate: async (
    clusterId: string,
    _: z.infer<typeof integrationSchema>,
    prevConfig: z.infer<typeof integrationSchema>
  ) => {
    logger.info("Deactivating Slack integration", {
      clusterId
    })

    if (!prevConfig.slack) {
      logger.warn("Can not deactivate Slack integration with no config")
      return
    }
    // Cleanup the Nango connection
    await deleteNangoConnection(prevConfig.slack.nangoConnectionId);
  },
  onActivate: async (
    clusterId: string,
    config: z.infer<typeof integrationSchema>,
    prevConfig: z.infer<typeof integrationSchema>
  ) => {
    logger.info("Activating Slack integration", {
      clusterId,
    })

    if (!config.slack) {
      logger.warn("Can not activate Slack integration with no config")
      return
    }

    // It can be possible for the same Nango session token to be used to create multiple connections
    // e.g, if the "try again" button.
    // This check will cleanup a previous connection if it is not the same
    if (
      prevConfig.slack
        && config.slack
        && prevConfig.slack.nangoConnectionId !== config.slack.nangoConnectionId
    ) {
      logger.warn("Slack integration has been overridden. Cleaning up previous Nango connection", {
        prevNangoConnectionId: prevConfig.slack.nangoConnectionId,
        nangoConnectionId: config.slack.nangoConnectionId
      })

      await deleteNangoConnection(prevConfig.slack.nangoConnectionId);
    }

    // If the user connects another cluster with the same Slack workspace, we cleanup the conflicting integrations
    await cleanupConflictingIntegrations(clusterId, config);
  },
  handleCall: async () => {
    logger.warn("Slack integration does not support calls");
  },
}

export const handleNewRunMessage = async ({
  message,
  metadata,
}: {
  message: {
    id: string;
    clusterId: string;
    runId: string;
    type: InferSelectModel<typeof workflowMessages>["type"];
    data: InferSelectModel<typeof workflowMessages>["data"];
  };
  metadata?: Record<string, string>;
}) => {
  if (message.type !== "agent") {
    return;
  }

  if (!metadata?.[THREAD_META_KEY] || !metadata?.[CHANNEL_META_KEY]) {
    return;
  }

  const integration = await integrationByCluster(message.clusterId);
  if (!integration || !integration.slack) {
    throw new Error(`Could not find Slack integration for cluster: ${message.clusterId}`);
  }

  const token = await getAccessToken(integration.slack.nangoConnectionId);
  if (!token) {
    throw new Error(`Could not fetch access token for Slack integration: ${integration.slack.nangoConnectionId}`);
  }

  const client = new webApi.WebClient(token)

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

export const handleApprovalRequest = async ({
  callId,
  runId,
  clusterId,
  service,
  targetFn,
  metadata,
}: {
  callId: string;
  runId: string;
  clusterId: string;
  service: string;
  targetFn: string;
  metadata?: Record<string, string>;
}) => {
  if (!metadata?.[THREAD_META_KEY] || !metadata?.[CHANNEL_META_KEY]) {
    return;
  }

  const integration = await integrationByCluster(clusterId);
  if (!integration || !integration.slack) {
    throw new Error(`Could not find Slack integration for cluster: ${clusterId}`);
  }

  const token = await getAccessToken(integration.slack.nangoConnectionId);
  if (!token) {
    throw new Error(`Could not fetch access token for Slack integration: ${integration.slack.nangoConnectionId}`);
  }

  const client = new webApi.WebClient(token)

  client?.chat.postMessage({
    thread_ts: metadata[THREAD_META_KEY],
    channel: metadata[CHANNEL_META_KEY],
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `I need your approval to call \`${service}.${targetFn}\` on run <${env.APP_ORIGIN}/clusters/${clusterId}/runs/${runId}|${runId}>`
        }
      },
      {
        "type": "actions",
        "elements": [
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "Approve",
              "emoji": true
            },
            "value": callId,
            "action_id": CALL_APPROVE_ACTION_ID
          },
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "Deny",
              "emoji": true
            },
            "value": callId,
            "action_id": CALL_DENY_ACTION_ID
          }
        ]
      }
    ]
  });
};

export const start = async (fastify: FastifyInstance) => {
  const SLACK_SIGNING_SECRET = env.SLACK_SIGNING_SECRET;

  if (!SLACK_SIGNING_SECRET) {
    logger.info("Missing Slack environment variables. Skipping Slack integration.");
    return;
  }

  app = new App({
    authorize: async ({ teamId, enterpriseId }) => {
      if (!teamId) {
        logger.warn("Slack event is missing teamId");
        throw new Error("Slack event is missing teamId");
      }
      const integration = await integrationByTeam(teamId);

      if (!integration || !integration.slack) {
        logger.warn("Could not find Slack integration for teamId", {
          teamId
        });
        throw new Error("Could not find Slack integration for teamId");
      }

      const token = await getAccessToken(integration.slack.nangoConnectionId)
      if (!token) {
        throw new Error(`Could not fetch access token for Slack integration: ${integration.slack.nangoConnectionId}`);
      }

      return {
        teamId,
        enterpriseId,
        botUserId: integration.slack.botUserId,
        botToken: token,
      }
    },
    receiver: new FastifySlackReceiver({
      signingSecret: SLACK_SIGNING_SECRET,
      path: "/slack/events",
      fastify,
    }),
  });

  app.action(CALL_APPROVE_ACTION_ID, async (params) => handleCallApprovalAction({ ...params, actionId: CALL_APPROVE_ACTION_ID }));
  app.action(CALL_DENY_ACTION_ID, async (params) => handleCallApprovalAction({ ...params, actionId: CALL_DENY_ACTION_ID }));

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
  app.event("message", async ({ event, client, context }) => {
    logger.info("Received message event. Responding.", event);

    if (event.subtype === "message_changed") {
      logger.info("Received message change event. Ignoring.", event);
      return;
    }

    if (isBotMessage(event)) {
      logger.info("Received message from bot. Ignoring.", event);
      return;
    }

    if (!isDirectMessage(event)) {
      logger.info("Received message from channel. Ignoring.", event);
      return;
    }

    const teamId = context.teamId

    if (!teamId) {
      logger.warn("Received message without teamId. Ignoring.");
      return;
    }

    const integration = await integrationByTeam(teamId);
    if (!integration) {
      logger.warn("Could not Slack integration for teamId.", {
        teamId,
      });
      return;
    }

    try {
      if (!hasUser(event)) {
        logger.warn("Slack event has no user.", { event });
        throw new AuthenticationError("Slack event has no user");
      }

      const user = await authenticateUser(event.user, client, integration);

      if (hasThread(event)) {
        await handleExistingThread({
          userId: user?.id,
          event,
          client,
          clusterId: integration.cluster_id,
        });
      } else {
        await handleNewThread({
          userId: user?.id,
          event,
          client,
          clusterId: integration.cluster_id,
        });
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        client.chat.postMessage({
          thread_ts: event.ts,
          channel: event.channel,
          text: `Sorry, I am having trouble authenticating you.\n\nPlease ensure your Inferable account has access to cluster <${env.APP_ORIGIN}/clusters/${integration.cluster_id}|${integration.cluster_id}>.`,
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

const isDirectMessage = (e: KnownEventFromType<"message">): boolean => {
  return e.channel_type === "im";
};

const hasUser = (e: any): e is { user: string } => {
  return typeof e?.user === "string";
};

const isBlockAction = (e: SlackAction): e is BlockAction => {
  return typeof e?.type === "string" && e.type === "block_actions";
}

const hasValue = (e: any): e is { value: string } => {
  return 'value' in e && typeof e?.value === "string";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isBotMessage = (e: any): boolean => {
  return typeof e?.bot_id === "string";
};

const integrationByTeam = async (teamId: string) => {
  const [result] = await db.select({
    cluster_id: integrations.cluster_id,
    slack: integrations.slack,
  })
    .from(integrations)
    .where(sql`slack->>'teamId' = ${teamId}`);

  return result;
};

const integrationByCluster = async (clusterId: string) => {
  const [result] = await db.select({
    cluster_id: integrations.cluster_id,
    slack: integrations.slack,
  })
    .from(integrations)
    .where(
      eq(integrations.cluster_id, clusterId)
    );

  return result;
};


const getAccessToken = async (connectionId: string) => {
  if (!nango) {
    throw new Error("Nango is not configured");
  }

  const result = await nango.getToken(env.NANGO_SLACK_INTEGRATION_ID, connectionId);
  if (typeof result !== "string") {
    return null;
  }

  return result;
};

const cleanupConflictingIntegrations = async (clusterId: string, config: z.infer<typeof integrationSchema>) => {
  if (!config.slack) {
    return;
  }

  const conflicts = await db
    .select({
      cluster_id: integrations.cluster_id,
      slack: integrations.slack,
    })
    .from(integrations)
    .where(
      and(
        sql`slack->>'teamId' = ${config.slack.teamId}`,
        ne(integrations.cluster_id, clusterId)
      )
    );

  if (conflicts.length) {
    logger.info("Removed conflicting Slack integrations", {
      conflicts: conflicts.map((conflict) => conflict.cluster_id)
    })

    // Cleanup Slack integrations from DB
    await db
    .delete(integrations)
    .where(
      and(
        sql`slack->>'teamId' = ${config.slack.teamId}`,
        ne(integrations.cluster_id, clusterId)
      )
    );

    // Cleanup Nango connections
    await Promise.allSettled(conflicts.map(async (conflict) => {
      if (conflict.slack) {
        await deleteNangoConnection(conflict.slack.nangoConnectionId);
      }
    }));

  }
}

const deleteNangoConnection = async (connectionId: string) => {
  if (!nango) {
    throw new Error("Nango is not configured");
  }

  await nango.deleteConnection(
    env.NANGO_SLACK_INTEGRATION_ID,
    connectionId
  );
};

const handleNewThread = async ({ event, client, clusterId, userId }: MessageEvent) => {
  let thread = event.ts;
  // If this message is part of a thread, associate the run with the thread rather than the message
  if (hasThread(event)) {
    thread = event.thread_ts;
  }

  if ("text" in event && event.text) {
    const run = await createRunWithMessage({
      userId,
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

const handleExistingThread = async ({ event, client, clusterId, userId }: MessageEvent) => {
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
        userId,
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
        userId,
        event,
        client,
        clusterId,
      });
    }

    return;
  }

  throw new Error("Event had no text");
};

const authenticateUser = async (userId: string, client: webApi.WebClient, integration: { cluster_id: string }) => {
  if (!env.CLERK_SECRET_KEY) {
    logger.info("Missing CLERK_SECRET_KEY. Skipping Slack user authentication.");
    return
  }

  const slackUser = await client.users.info({
    user: userId,
    token: client.token,
  });

  logger.info("Authenticating Slack user", {
    slackUser
  })

  const confirmed = slackUser.user?.is_email_confirmed;
  const email = slackUser.user?.profile?.email;

  if (!confirmed || !email) {
    logger.info("Could not authenticate Slack user.", {
      confirmed,
      email
    });
    throw new AuthenticationError("Could not authenticate Slack user");
  }

  const clerkUser = await getUserForCluster({
    emailAddress: email,
    cluserId: integration.cluster_id,
  });

  if (!clerkUser) {
    logger.info("Could not find Slack user in Clerk.");
    throw new AuthenticationError("Could not authenticate Slack user");
  }

  return clerkUser;
};

const handleCallApprovalAction = async ({
  ack,
  body,
  client,
  context,
  actionId
}: {
    ack: () => Promise<void>,
    body: SlackAction,
    client: webApi.WebClient,
    context: { teamId?: string },
    actionId: typeof CALL_APPROVE_ACTION_ID | typeof CALL_DENY_ACTION_ID
  }) => {
  await ack();

  if (!isBlockAction(body)) {
    throw new Error("Slack Action was unexpected type");
  }

  const approved  = actionId === CALL_APPROVE_ACTION_ID;
  const teamId = context.teamId;
  const channelId = body.channel?.id;
  const messageTs = body.message?.ts;
  const action = body.actions.find(a => a.action_id === actionId);

  if (!teamId || !channelId || !messageTs || !action || !hasValue(action)) {
    throw new Error("Slack action does not conform to expected structure");
  }

  const integration = await integrationByTeam(teamId);

  if (!integration || !integration.cluster_id) {
    throw new Error("Could not find Slack integration for teamId");
  }

  const user = await authenticateUser(body.user.id, client, integration);

  if (!user) {
    logger.warn("Slack user could not be authenticated.");
    throw new AuthenticationError("Slack user could not be authenticated.");
  }

  await submitApproval({
    approved,
    callId: action.value,
    clusterId: integration.cluster_id
  });

  logger.info("Call approval received via Slack", {
    approved,
    channelId,
    messageTs,
    callId: action.value,
  });

  const blockMessage = `${approved ? "✅" : "❌"} Call \`${action.value}\` was ${approved ? "approved" : "denied"}`;

  await client.chat.update({
    channel: channelId,
    ts: messageTs,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: blockMessage
        },
      },
    ],
  });
};
