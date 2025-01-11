import { initServer } from "@ts-rest/fastify";
import { contract } from "../contract";
import { createApiKey, listApiKeys, revokeApiKey } from "./cluster";
import { posthog } from "../posthog";
import { unqualifiedEntityId } from "./auth";

export const authRouter = initServer().router(
  {
    createApiKey: contract.createApiKey,
    listApiKeys: contract.listApiKeys,
    revokeApiKey: contract.revokeApiKey,
  },
  {
    createApiKey: async (request) => {
      const { name } = request.body;
      const { clusterId } = request.params;

      const auth = request.request.getAuth().isAdmin();
      await auth.canManage({ cluster: { clusterId } });

      const { id, key } = await createApiKey({
        clusterId,
        name,
        createdBy: auth.entityId,
      });

      posthog?.identify({
        distinctId: id,
        properties: {
          key_name: name,
          auth_type: "api",
          created_by: auth.entityId,
        },
      });

      posthog?.groupIdentify({
        distinctId: id,
        groupType: "organization",
        groupKey: auth.organizationId,
      });

      posthog?.groupIdentify({
        distinctId: id,
        groupType: "cluster",
        groupKey: clusterId,
      });

      posthog?.capture({
        distinctId: unqualifiedEntityId(auth.entityId),
        event: "api:api_key_create",
        groups: {
          organization: auth.organizationId,
          cluster: clusterId,
        },
        properties: {
          cluster_id: clusterId,
          key_id: id,
          key_name: id,
          cli_version: request.headers["x-cli-version"],
          user_agent: request.headers["user-agent"],
        },
      });

      return {
        status: 200,
        body: { id, key },
      };
    },
    listApiKeys: async (request) => {
      const { clusterId } = request.params;

      const auth = request.request.getAuth().isAdmin();
      await auth.canManage({ cluster: { clusterId } });

      const apiKeys = await listApiKeys({ clusterId });

      return {
        status: 200,
        body: apiKeys,
      };
    },
    revokeApiKey: async (request) => {
      const { clusterId, keyId } = request.params;

      const auth = request.request.getAuth().isAdmin();
      await auth.canManage({ cluster: { clusterId } });

      await revokeApiKey({ clusterId, keyId });

      posthog?.capture({
        distinctId: unqualifiedEntityId(auth.entityId),
        event: "api:api_key_revoke",
        groups: {
          organization: auth.organizationId,
          cluster: clusterId,
        },
        properties: {
          cluster_id: clusterId,
          api_key_id: keyId,
          cli_version: request.headers["x-cli-version"],
          user_agent: request.headers["user-agent"],
        },
      });

      return {
        status: 204,
        body: undefined,
      };
    },
  },
);
