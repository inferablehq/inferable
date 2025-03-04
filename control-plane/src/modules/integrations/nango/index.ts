import { Nango } from "@nangohq/node";
import { env } from "../../../utilities/env";
import { z } from "zod";
import { BadRequestError } from "../../../utilities/errors";
import { logger } from "../../observability/logger";

export const nango =
  env.NANGO_SECRET_KEY && new Nango({ secretKey: env.NANGO_SECRET_KEY });

export const webhookSchema = z.object({
  connectionId: z.string(),
  providerConfigKey: z.string(),
  provider: z.string(),
  operation: z.string(),
  success: z.boolean(),
  endUser: z.object({
    endUserId: z.string(),
  }),
});

export const getSession = async ({
  clusterId,
  integrationId,
}: {
  clusterId: string;
  integrationId: string;
}) => {
  if (!nango) {
    throw new Error("Nango is not configured");
  }

  const existing = await nango?.listConnections(undefined, undefined, {
    endUserId: clusterId,
  });

  if (
    existing?.connections.find((c) => c.provider_config_key === integrationId)
  ) {
    logger.warn("Attempted to create duplicate nango connection", {
      integrationId,
      existing: existing?.connections,
    });
    throw new BadRequestError(
      `Nango ${integrationId} connection already exists for cluster`,
    );
  }

  const res = await nango?.createConnectSession({
    end_user: {
      id: clusterId,
    },
    allowed_integrations: [integrationId],
  });

  return res?.data.token;
};
