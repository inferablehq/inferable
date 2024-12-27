import { initServer } from "@ts-rest/fastify";
import { contract } from "../contract";
import { getIntegrations, upsertIntegrations } from "./integrations";
import { validateConfig } from "./toolhouse";
import { BadRequestError } from "../../utilities/errors";

export const integrationsRouter = initServer().router(
  {
    upsertIntegrations: contract.upsertIntegrations,
    getIntegrations: contract.getIntegrations,
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
        body: {
          ...integrations,
          slack: {
            sessionToken: "123123"
          }
        }
      };
    },
  },
);
