import { initServer } from "@ts-rest/fastify";
import { contract } from "../contract";
import { getIntegrations, upsertIntegrations } from "./integrations";
import { validateConfig } from "./toolhouse";
import { AuthenticationError, BadRequestError } from "../../utilities/errors";
import { getSession, nango, webhookSchema } from "./nango";
import { env } from "../../utilities/env";
import { logger } from "../observability/logger";

export const integrationsRouter = initServer().router(
  {
    upsertIntegrations: contract.upsertIntegrations,
    getIntegrations: contract.getIntegrations,
    createNangoSession: contract.createNangoSession,
    createNangoEvent: contract.createNangoEvent,
  },
  {
    upsertIntegrations: async (request) => {
      const { clusterId } = request.params;

      if (request.body.slack) {
        throw new BadRequestError("Slack integration details are not editable");
      }

      if (request.body.toolhouse) {
        try {
          await validateConfig(request.body);
        } catch (error) {
          return {
            status: 400,
            body: {
              message: `Failed to validate ToolHouse config: ${error}`,
            },
          };
        }
      }

      await upsertIntegrations({
        clusterId,
        config: request.body,
      });

      return {
        status: 200,
        body: undefined,
      };
    },
    getIntegrations: async (request) => {
      const { clusterId } = request.params;

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });
      auth.isAdmin();

      const integrations = await getIntegrations({
        clusterId,
      });

      return {
        status: 200,
        body: integrations,
      };
    },
    createNangoSession: async (request) => {
      if (!nango) {
        throw new Error("Nango is not configured");
      }

      const { clusterId } = request.params;
      const { integration } = request.body;

      if (integration !== env.NANGO_SLACK_INTEGRATION_ID) {
        throw new BadRequestError("Invalid Nango integration ID");
      }

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });
      auth.isAdmin();

      return {
        status: 200,
        body: {
          token: await getSession({ clusterId, integrationId: env.NANGO_SLACK_INTEGRATION_ID }),
        },
      }
    },
    createNangoEvent: async (request) => {
      if (!nango) {
        throw new Error("Nango is not configured");
      }

      const signature = request.headers["x-nango-signature"];

      const isValid = nango.verifyWebhookSignature(signature, request.body);

      if (!isValid) {
        throw new AuthenticationError("Invalid Nango webhook signature");
      }

      logger.info("Received Nango webhook", {
        body: request.body
      });

      const webhook = webhookSchema.safeParse(request.body);
      if (!webhook.success) {
        logger.error("Failed to parse Nango webhook", {
          error: webhook.error,
        })
        throw new BadRequestError("Invalid Nango webhook payload");
      }

      if (
        webhook.data.provider === "slack"
          && webhook.data.operation === "creation"
          && webhook.data.success
      ) {
        const connection = await nango.getConnection(
          webhook.data.providerConfigKey,
          webhook.data.connectionId,
        );

        logger.info("New Slack connection registered", {
          connectionId: webhook.data.connectionId,
          teamId: connection.connection_config["team.id"],
        });

        const clusterId = connection.end_user?.id;

        if (!clusterId) {
          throw new BadRequestError("End user ID not found in Nango connection");
        }

        await upsertIntegrations({
          clusterId,
          config: {
            slack: {
              nangoConnectionId: webhook.data.connectionId,
              teamId: connection.connection_config["team.id"],
              botUserId: connection.connection_config["bot_user_id"],
            },
          }
        })
      }

      return {
        status: 200,
        body: undefined,
      }
    }
  },
);
