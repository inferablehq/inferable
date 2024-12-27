import { initServer } from "@ts-rest/fastify";
import { contract } from "../contract";
import { getIntegrations, upsertIntegrations } from "./integrations";
import { validateConfig } from "./toolhouse";
import { AuthenticationError, BadRequestError } from "../../utilities/errors";
import { getSession, nango, slackConnectionSchema, webhookSchema } from "./nango";
import { env } from "../../utilities/env";
import { logger } from "../observability/logger";

export const integrationsRouter = initServer().router(
  {
    upsertIntegrations: contract.upsertIntegrations,
    getIntegrations: contract.getIntegrations,
    nangoWebhook: contract.nangoWebhook,
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
        config: {
          ...request.body,
          slack: undefined,
        },
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

      if (!integrations.slack?.nangoConnectionId) {
        integrations.slack = {
          nangoSessionToken: await getSession({
            clusterId,
            integrationId: env.NANGO_SLACK_INTEGRATION_ID,
          }),
        } as any;
      }

      return {
        status: 200,
        body: {
          ...integrations,
        }
      };
    },
    nangoWebhook: async (request) => {
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
        const connectionResp = await nango.getConnection(
          webhook.data.providerConfigKey,
          webhook.data.connectionId,
        );

        const connection = slackConnectionSchema.safeParse(connectionResp);

        if (connection.success) {
          logger.info("New Slack connection registered", {
            connectionId: webhook.data.connectionId,
            teamId: connection.data.connection_config["team.id"],
          });

          await upsertIntegrations({
            clusterId: webhook.data.endUser.endUserId,
            config: {
              slack: {
                nangoConnectionId: webhook.data.connectionId,
                teamId: connection.data.connection_config["team.id"],
                botUserId: connection.data.connection_config["bot_user_id"],
              },
            }
          })
        }
      }

      return {
        status: 200,
        body: undefined,
      }
    }
  },
);
