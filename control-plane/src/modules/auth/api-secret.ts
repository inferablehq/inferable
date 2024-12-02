import * as data from "../data";
import { eq, and, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { logger } from "../observability/logger";
import { createCache } from "../../utilities/cache";

const authContextCache = createCache<{
  clusterId: string;
  id: string;
  organizationId: string;
}>(
  Symbol("authContextCach"),
);

const hashFromSecret = (secret: string): string => {
  return createHash("sha256").update(secret).digest("hex");
};

export const isApiSecret = (authorization: string): boolean =>
  authorization.startsWith("sk_");

export const verifyApiKey = async (
  secret: string,
): Promise<
  { clusterId: string; id: string; organizationId: string } | undefined
> => {
  const secretHash = hashFromSecret(secret);

  const cached = await authContextCache.get(secretHash);

  if (cached) {
    return cached;
  }

  const [result] = await data.db
    .select({
      clusterId: data.apiKeys.cluster_id,
      id: data.apiKeys.id,
      organizationId: data.clusters.organization_id,
      deletedAt: data.clusters.deleted_at,
    })
    .from(data.apiKeys)
    .leftJoin(data.clusters, eq(data.apiKeys.cluster_id, data.clusters.id))
    .where(
      and(
        eq(data.apiKeys.secret_hash, secretHash),
        isNull(data.apiKeys.revoked_at),
      ),
    )
    .limit(1);

  if (!result || !!result.deletedAt) {
    return undefined;
  }

  if (!result.organizationId) {
    logger.warn("API Key's cluster has no associated organization", {
      clusterId: result.clusterId,
    });
    return undefined;
  }

  await authContextCache.set(secretHash, {
    clusterId: result.clusterId,
    id: result.id,
    organizationId: result.organizationId,
  }, 60);

  return {
    organizationId: result.organizationId!,
    clusterId: result.clusterId,
    id: result.id,
  };
};

export const createApiKey = async ({
  clusterId,
  createdBy,
  name,
}: {
  clusterId: string;
  createdBy: string;
  name: string;
}): Promise<{ id: string; key: string }> => {
  const id = randomBytes(16).toString("hex");
  const key = `sk_${randomBytes(32).toString("base64").replace(/[+/=]/g, "")}`;

  await data.db.insert(data.apiKeys).values({
    id,
    name,
    // TODO: Remove this field
    type: "cluster_manage",
    secret_hash: hashFromSecret(key),
    cluster_id: clusterId,
    created_by: createdBy,
  });

  return { id, key };
};

export const listApiKeys = async ({
  clusterId,
}: {
  clusterId: string;
}): Promise<
  {
    id: string;
    name: string;
    createdAt: Date;
    createdBy: string;
    revokedAt: Date | null;
  }[]
> => {
  const apiKeys = await data.db
    .select({
      id: data.apiKeys.id,
      name: data.apiKeys.name,
      createdAt: data.apiKeys.created_at,
      createdBy: data.apiKeys.created_by,
      revokedAt: data.apiKeys.revoked_at,
    })
    .from(data.apiKeys)
    .where(eq(data.apiKeys.cluster_id, clusterId));

  return apiKeys;
};

export const revokeApiKey = async ({
  clusterId,
  keyId,
}: {
  clusterId: string;
  keyId: string;
}) => {
  await data.db
    .update(data.apiKeys)
    .set({ revoked_at: new Date() })
    .where(
      and(eq(data.apiKeys.cluster_id, clusterId), eq(data.apiKeys.id, keyId)),
    );
};
