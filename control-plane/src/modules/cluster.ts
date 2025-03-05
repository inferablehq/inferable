import { and, count, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { createCache } from "../utilities/cache";
import { NotFoundError } from "../utilities/errors";
import * as cron from "./cron";
import * as data from "./data";
import { toModelInput } from "./prompts";
import { getLatestVersionedText } from "./versioned-text";
import { logger } from "./observability/logger";

export const getClusterDetails = async (clusterId: string) => {
  const [cluster] = await data.db
    .select({
      id: data.clusters.id,
      name: data.clusters.name,
      description: data.clusters.description,
      enable_custom_auth: data.clusters.enable_custom_auth,
      handle_custom_auth_function: data.clusters.handle_custom_auth_function,
      additional_context: data.clusters.additional_context,
      organization_id: data.clusters.organization_id,
      deleted_at: data.clusters.deleted_at,
      is_demo: data.clusters.is_demo,
    })
    .from(data.clusters)
    .where(eq(data.clusters.id, clusterId));

  if (!cluster) {
    throw new NotFoundError(`Cluster not found: ${clusterId}`);
  }

  return cluster;
};

const markEphemeralClustersForDeletion = async () => {
  // Find 10 at a time
  const clusters = await data.db
    .update(data.clusters)
    .set({
      deleted_at: new Date(),
      organization_id: null,
    })
    .returning({
      id: data.clusters.id,
    })
    .where(
      and(
        isNull(data.clusters.deleted_at),
        eq(data.clusters.is_ephemeral, true),
        lt(data.clusters.created_at, new Date(Date.now() - 1000 * 60 * 60 * 12)) // 12 hours
      )
    );

  logger.info("Marked ephemeral clusters for deletion", {
    count: clusters.length,
    clusterIds: clusters.map(cluster => cluster.id),
  });
};

export const cleanupMarkedClusters = async () => {
  const clusters = await data.db
    .select({
      id: data.clusters.id,
    })
    .from(data.clusters)
    .where(
      and(
        isNotNull(data.clusters.deleted_at),
        lt(data.clusters.deleted_at, new Date(Date.now() - 1000 * 60 * 60 * 24)) // 12 hours
      )
    );

  logger.info("Deleting marked clusters", {
    count: clusters.length,
    clusterIds: clusters.map(cluster => cluster.id),
  });

  for (const cluster of clusters) {
    try {
      await data.db.transaction(async tx => {
        await tx.execute(sql`DELETE FROM "agents" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "versioned_entities" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "blobs" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "api_keys" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "embeddings" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "run_messages" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "runs" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "external_messages" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "run_tags" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "integrations" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "services" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "machines" WHERE cluster_id = ${cluster.id}`);

        await tx.execute(sql`DELETE FROM "workflow_executions" WHERE cluster_id = ${cluster.id}`);
        await tx.execute(sql`DELETE FROM "jobs" WHERE cluster_id = ${cluster.id}`);

        // Events are not removed from the database, but they are marked as deleted for future cleanup
        await tx.execute(
          sql`UPDATE "events" SET deleted_at = now() WHERE cluster_id = ${cluster.id}`
        );

        await tx.execute(sql`DELETE FROM "clusters" WHERE id = ${cluster.id}`);
      });
    } catch (error) {
      logger.error("Error deleting cluster and associated data", {
        clusterId: cluster.id,
        error: error,
      });
    }
  }
};

const cache = createCache<boolean>(Symbol("clusterExists"));

export const clusterExists = async ({
  organizationId,
  clusterId,
}: {
  organizationId: string;
  clusterId: string;
}): Promise<boolean> => {
  const key = `${organizationId}:${clusterId}`;

  const cached = await cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const [cluster] = await data.db
    .select({
      count: count(),
    })
    .from(data.clusters)
    .where(and(eq(data.clusters.id, clusterId), eq(data.clusters.organization_id, organizationId)));

  const exists = cluster.count > 0;
  await cache.set(key, exists, 60);
  return exists;
};

export const start = async () => {
  cron.registerCron(markEphemeralClustersForDeletion, "mark-ephemeral-clusters", {
    interval: 1000 * 60 * 15,
  }); // 15 minutes
  cron.registerCron(cleanupMarkedClusters, "cleanup-marked-clusters", { interval: 1000 * 60 * 15 }); // 15 minutes
};
