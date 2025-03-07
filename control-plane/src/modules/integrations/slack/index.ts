import {
  App,
  BlockAction,
  KnownEventFromType,
  SlackAction,
  webApi,
} from "@slack/bolt";
import { FastifySlackReceiver } from "./receiver";
import { env } from "../../../utilities/env";
import { FastifyInstance } from "fastify";
import { logger } from "../../observability/logger";
import { AuthenticationError } from "../../../utilities/errors";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, integrations } from "../../data";
import { nango } from "../nango";
import { InstallableIntegration } from "../types";
import { z } from "zod";
import { getUserForCluster } from "../../dependencies/clerk";
import { submitApproval } from "../../jobs/jobs";
import { integrationSchema, notificationSchema } from "../../contract";

export const THREAD_META_KEY = "slackThreadTs";
export const CHANNEL_META_KEY = "slackChannel";

const CALL_APPROVE_ACTION_ID = "call_approve";
const CALL_DENY_ACTION_ID = "call_deny";

let app: App | undefined;

export const slack: InstallableIntegration = {
  name: "slack",
  onDeactivate: async (
    clusterId: string,
    _: z.infer<typeof integrationSchema>,
    prevConfig: z.infer<typeof integrationSchema>,
  ) => {
    logger.info("Deactivating Slack integration", {
      clusterId,
    });

    if (!prevConfig.slack) {
      logger.warn("Can not deactivate Slack integration with no config");
      return;
    }
    // Cleanup the Nango connection
    await deleteNangoConnection(prevConfig.slack.nangoConnectionId);
  },
  onActivate: async (
    clusterId: string,
    config: z.infer<typeof integrationSchema>,
    prevConfig: z.infer<typeof integrationSchema>,
  ) => {
    logger.info("Activating Slack integration", {
      clusterId,
    });

    if (!config.slack) {
      logger.warn("Can not activate Slack integration with no config");
      return;
    }

    // It can be possible for the same Nango session token to be used to create multiple connections
    // e.g, if the "try again" button.
    // This check will cleanup a previous connection if it is not the same
    if (
      prevConfig.slack &&
      config.slack &&
      prevConfig.slack.nangoConnectionId !== config.slack.nangoConnectionId
    ) {
      logger.warn(
        "Slack integration has been overridden. Cleaning up previous Nango connection",
        {
          prevNangoConnectionId: prevConfig.slack.nangoConnectionId,
          nangoConnectionId: config.slack.nangoConnectionId,
        },
      );

      await deleteNangoConnection(prevConfig.slack.nangoConnectionId);
    }

    // If the user connects another cluster with the same Slack workspace, we cleanup the conflicting integrations
    await cleanupConflictingIntegrations(clusterId, config);
  },
  handleCall: async () => {
    logger.warn("Slack integration does not support calls");
  },
};

export const sendSlackNotification = async ({
  clusterId,
  notification,
  blocks,
}: {
  clusterId: string;
  blocks?: (webApi.Block | webApi.KnownBlock)[];
  notification?: z.infer<typeof notificationSchema>;
}) => {
  if (notification?.destination?.type !== "slack") {
    return;
  }

  const integration = await integrationByCluster(clusterId);
  if (!integration || !integration.slack) {
    throw new Error(
      `Could not find Slack integration for cluster: ${clusterId}`,
    );
  }

  const token = await getAccessToken(integration.slack.nangoConnectionId);
  if (!token) {
    throw new Error(
      `Could not fetch access token for Slack integration: ${integration.slack.nangoConnectionId}`,
    );
  }

  const client = new webApi.WebClient(token);

  let channelId = notification?.destination?.channelId;
  let userId = notification?.destination?.userId;

  const email = notification?.destination?.email;
  const threadId = notification?.destination?.threadId;

  if (!channelId && !threadId && email) {
    logger.info("Finding Slack userId from email");

    // Find user's email
    const user = await client.users.lookupByEmail({
      email: email,
    });

    // Check if the user was found successfully
    if (!user.ok || !user.user?.id) {
      throw new Error(`Failed to find Slack user with email: ${user.error}`);
    }

    userId = user.user?.id;
  }

  if (!channelId && !threadId && userId) {
    logger.info("Finding Slack channel with userId");

    const conversations = await client.conversations.open({
      users: userId,
    });

    // Check if the conversation was opened successfully
    if (!conversations.ok || !conversations.channel?.id) {
      throw new Error(
        `Failed to open Slack conversation with user: ${conversations.error}`,
      );
    }

    channelId = conversations.channel?.id;
  }

  if (!channelId) {
    throw new Error("Could not determine Slack channel for notification");
  }

  await client?.chat.postMessage({
    thread_ts: threadId,
    channel: channelId,
    mrkdwn: true,
    text: notification.message,
    blocks: blocks ?? [],
  });
};

export const notifyApprovalRequest = async ({
  jobId,
  clusterId,
  targetFn,
  notification,
}: {
  jobId: string;
  clusterId: string;
  targetFn: string;
  notification?: z.infer<typeof notificationSchema>;
}) => {
  if (notification?.destination?.type !== "slack") {
    return;
  }

  notification.message =
    notification?.message ?? `I need your approval to call \`${targetFn}\`.`;

  await sendSlackNotification({
    clusterId,
    notification,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: notification.message,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Approve",
            },
            value: jobId,
            action_id: CALL_APPROVE_ACTION_ID,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Deny",
            },
            value: jobId,
            action_id: CALL_DENY_ACTION_ID,
          },
        ],
      },
    ],
  });
};

export const start = async (fastify: FastifyInstance) => {
  const SLACK_SIGNING_SECRET = env.SLACK_SIGNING_SECRET;

  if (!SLACK_SIGNING_SECRET) {
    logger.info(
      "Missing Slack environment variables. Skipping Slack integration.",
    );
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
          teamId,
        });
        throw new Error("Could not find Slack integration for teamId");
      }

      const token = await getAccessToken(integration.slack.nangoConnectionId);
      if (!token) {
        throw new Error(
          `Could not fetch access token for Slack integration: ${integration.slack.nangoConnectionId}`,
        );
      }

      return {
        teamId,
        enterpriseId,
        botUserId: integration.slack.botUserId,
        botToken: token,
      };
    },
    receiver: new FastifySlackReceiver({
      signingSecret: SLACK_SIGNING_SECRET,
      path: "/slack/events",
      fastify,
    }),
  });

  app.action(CALL_APPROVE_ACTION_ID, async params =>
    handleCallApprovalAction({ ...params, actionId: CALL_APPROVE_ACTION_ID }),
  );
  app.action(CALL_DENY_ACTION_ID, async params =>
    handleCallApprovalAction({ ...params, actionId: CALL_DENY_ACTION_ID }),
  );

  // Event listener for mentions
  app.event("app_mention", async ({ event, client }) => {
    logger.info("Received mention event. Responding.", event);

    await client.chat.postMessage({
      thread_ts: event.ts,
      channel: event.channel,
      mrkdwn: true,
      text: "Hey! I don't currently respond to mentions.",
    });
  });

  // Event listener for direct messages
  app.event("message", async ({ event, client }) => {
    logger.info("Received message event. Responding.", event);

    await client.chat.postMessage({
      thread_ts: event.ts,
      channel: event.channel,
      mrkdwn: true,
      text: "Hey! I don't currently respond to direct messages.",
    });
  });

  await app.start();
};

export const stop = async () => await app?.stop();

const isBlockAction = (e: SlackAction): e is BlockAction => {
  return typeof e?.type === "string" && e.type === "block_actions";
};

const hasValue = (e: any): e is { value: string } => {
  return "value" in e && typeof e?.value === "string";
};

const integrationByTeam = async (teamId: string) => {
  const [result] = await db
    .select({
      cluster_id: integrations.cluster_id,
      slack: integrations.slack,
    })
    .from(integrations)
    .where(sql`slack->>'teamId' = ${teamId}`);

  return result;
};

const integrationByCluster = async (clusterId: string) => {
  const [result] = await db
    .select({
      cluster_id: integrations.cluster_id,
      slack: integrations.slack,
    })
    .from(integrations)
    .where(eq(integrations.cluster_id, clusterId));

  return result;
};

const getAccessToken = async (connectionId: string) => {
  if (!nango) {
    throw new Error("Nango is not configured");
  }

  const result = await nango.getToken(
    env.NANGO_SLACK_INTEGRATION_ID,
    connectionId,
  );
  if (typeof result !== "string") {
    return null;
  }

  return result;
};

export const cleanupConflictingIntegrations = async (
  clusterId: string,
  config: z.infer<typeof integrationSchema>,
) => {
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
        ne(integrations.cluster_id, clusterId),
      ),
    );

  if (conflicts.length) {
    logger.info("Removing conflicting Slack integrations", {
      conflicts: conflicts.map(conflict => conflict.cluster_id),
    });

    // Cleanup Nango connections
    await Promise.allSettled(
      conflicts.map(async conflict => {
        if (conflict.slack) {
          await deleteNangoConnection(conflict.slack.nangoConnectionId);
        }
      }),
    );

    // Cleanup Slack integrations from DB
    await db
      .delete(integrations)
      .where(
        and(
          sql`slack->>'teamId' = ${config.slack.teamId}`,
          ne(integrations.cluster_id, clusterId),
        ),
      );
  }
};

const deleteNangoConnection = async (connectionId: string) => {
  if (!nango) {
    throw new Error("Nango is not configured");
  }

  await nango.deleteConnection(env.NANGO_SLACK_INTEGRATION_ID, connectionId);
};

const authenticateUser = async (
  userId: string,
  client: webApi.WebClient,
  integration: { cluster_id: string },
) => {
  if (!env.CLERK_SECRET_KEY) {
    logger.info(
      "Missing CLERK_SECRET_KEY. Skipping Slack user authentication.",
    );
    return;
  }

  const slackUser = await client.users.info({
    user: userId,
    token: client.token,
  });

  logger.info("Authenticating Slack user", {
    slackUser,
  });

  const confirmed = slackUser.user?.is_email_confirmed;
  const email = slackUser.user?.profile?.email;

  if (!confirmed || !email) {
    logger.info("Could not authenticate Slack user.", {
      confirmed,
      email,
    });
    throw new AuthenticationError("Could not authenticate Slack user");
  }

  const clerkUser = await getUserForCluster({
    emailAddress: email,
    clusterId: integration.cluster_id,
  });

  if (!clerkUser) {
    logger.info("Could not find Slack user in Clerk.");
    throw new AuthenticationError("Could not authenticate Slack user");
  }

  return {
    userId: `clerk:${clerkUser.id}`,
    slack: {
      id: userId,
      email,
    },
  };
};

const handleCallApprovalAction = async ({
  ack,
  body,
  client,
  context,
  actionId,
}: {
  ack: () => Promise<void>;
  body: SlackAction;
  client: webApi.WebClient;
  context: { teamId?: string };
  actionId: typeof CALL_APPROVE_ACTION_ID | typeof CALL_DENY_ACTION_ID;
}) => {
  await ack();

  if (!isBlockAction(body)) {
    throw new Error("Slack Action was unexpected type");
  }

  const approved = actionId === CALL_APPROVE_ACTION_ID;
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
    jobId: action.value,
    clusterId: integration.cluster_id,
  });

  logger.info("Call approval received via Slack", {
    approved,
    channelId,
    messageTs,
    jobId: action.value,
  });

  const text = `${approved ? "✅" : "❌"} Call \`${action.value}\` was ${approved ? "approved" : "denied"}`;

  await client.chat.update({
    channel: channelId,
    ts: messageTs,
    text,
  });
};
