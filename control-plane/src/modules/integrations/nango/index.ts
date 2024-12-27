import { Nango } from "@nangohq/node";
import { env } from "../../../utilities/env";

const nango = env.NANGO_SECRET_KEY && new Nango({ secretKey: env.NANGO_SECRET_KEY });

export const getSession = async ({
  userId,
  organizationId,
  integrationId,
}: {
  userId: string;
  organizationId: string;
  integrationId: string;
}) => {
  if (!nango) {
    throw new Error("Nango is not configured");
  }

  const res = await nango?.createConnectSession({
    end_user: {
      id: userId,
    },
    organization: {
      id: organizationId,
    },
    allowed_integrations: [integrationId],
  });

  return res?.data.token;
};
