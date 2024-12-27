import { Nango } from "@nangohq/node";
import { env } from "../../../utilities/env";
import { z } from "zod";

export const nango = env.NANGO_SECRET_KEY && new Nango({ secretKey: env.NANGO_SECRET_KEY });

export const webhookSchema = z.object({
  connectionId: z.string(),
  providerConfigKey: z.string(),
  provider: z.string(),
  operation: z.string(),
  success: z.boolean(),
  endUser: z.object({
    endUserId: z.string(),
  })
})

export const slackConnectionSchema = z.object({
  connection_config: z.object({
    "team.id": z.string(),
    "bot_user_id": z.string(),
  }),
})


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

  const res = await nango?.createConnectSession({
    end_user: {
      id: clusterId,
    },
    allowed_integrations: [integrationId],
  });

  return res?.data.token;
};
