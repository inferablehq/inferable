import { and, count, eq, lt } from "drizzle-orm";
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
        eq(data.clusters.is_ephemeral, true),
        lt(data.clusters.created_at, new Date(Date.now() - 1000 * 60 * 60 * 24))
      )
    )

  logger.info("Cleaning up ephemeral clusters", {
    count: clusters.length,
    clusterIds: clusters.map((cluster) => cluster.id),
  });
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

export const getClusterContextText = async (clusterId: string) => {
  const [cluster] = await data.db
    .select({
      additionalContext: data.clusters.additional_context,
    })
    .from(data.clusters)
    .where(eq(data.clusters.id, clusterId));

  // backwards compatibility
  const html =
    typeof cluster.additionalContext === "string"
      ? cluster.additionalContext
      : (getLatestVersionedText(cluster.additionalContext)?.content ?? "");

  return toModelInput(html);
};

export const start = async () => {
  cron.registerCron(markEphemeralClustersForDeletion, "cleanup-ephemeral", { interval: 1000 * 60 * 15 }); // 15 minutes
};
