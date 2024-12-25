import { and, count, eq } from "drizzle-orm";
import { createCache } from "../utilities/cache";
import { NotFoundError } from "../utilities/errors";
import * as data from "./data";
import { toModelInput } from "./prompts";
import { getLatestVersionedText } from "./versioned-text";

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
    })
    .from(data.clusters)
    .where(eq(data.clusters.id, clusterId));

  if (!cluster) {
    throw new NotFoundError(`Cluster not found: ${clusterId}`);
  }

  return cluster;
};

const cache = createCache<boolean>(Symbol("clusterExists"));

export const clusterExists = async ({
  organizationId,
  clusterId,
}: {
  organizationId: string;
  clusterId: string;
}): Promise<boolean> => {
  const cached = await cache.get(`${organizationId}:${clusterId}`);

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
  await cache.set(`${organizationId}:${clusterId}`, exists, 1000 * 60);
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
