import { and, eq, gte, max } from "drizzle-orm";
import { ulid } from "ulid";
import * as errors from "../utilities/errors";
import * as data from "./data";
import { randomName } from "./names";
import { storedServiceDefinitionSchema } from "./service-definitions";
import { VersionedTexts } from "./versioned-text";

export const getClusters = async ({
  organizationId,
}: {
  organizationId: string;
}): Promise<
  Array<{
    id: string;
    name: string;
    createdAt: Date;
    description: string | null;
  }>
> => {
  const clusters = await data.db
    .select({
      id: data.clusters.id,
      name: data.clusters.name,
      createdAt: data.clusters.created_at,
      description: data.clusters.description,
    })
    .from(data.clusters)
    .where(eq(data.clusters.organization_id, organizationId));

  return clusters;
};

export const createCluster = async ({
  name,
  organizationId,
  description,
  isDemo,
}: {
  name?: string;
  organizationId: string;
  description: string;
  isDemo?: boolean;
}): Promise<{
  id: string;
  name: string;
}> => {
  const id = ulid();

  return data.db
    .insert(data.clusters)
    .values([
      {
        id,
        name: name || `${randomName(" ")}`,
        organization_id: organizationId,
        description,
        is_demo: isDemo,
      },
    ])
    .returning({
      id: data.clusters.id,
      name: data.clusters.name,
    })
    .execute()
    .then(r => r[0]);
};

export const deleteCluster = async ({ clusterId }: { clusterId: string }) => {
  await data.db
    .update(data.clusters)
    .set({ deleted_at: new Date(), organization_id: null })
    .where(eq(data.clusters.id, clusterId));
};

export const editClusterDetails = async ({
  organizationId,
  clusterId,
  name,
  description,
  additionalContext,
  debug,
  enableCustomAuth,
  handleCustomAuthFunction,
  enableKnowledgebase,
}: {
  organizationId: string;
  clusterId: string;
  name?: string;
  description?: string;
  additionalContext?: VersionedTexts;
  debug?: boolean;
  enableCustomAuth?: boolean;
  handleCustomAuthFunction?: string;
  enableKnowledgebase?: boolean;
}) => {
  const clusters = await data.db
    .update(data.clusters)
    .set({
      description,
      name,
      additional_context: additionalContext,
      debug,
      enable_custom_auth: enableCustomAuth,
      handle_custom_auth_function: handleCustomAuthFunction,
      enable_knowledgebase: enableKnowledgebase,
    })
    .where(and(eq(data.clusters.id, clusterId), eq(data.clusters.organization_id, organizationId)))
    .returning({
      id: data.clusters.id,
    })
    .execute();

  if (clusters.length === 0) {
    throw new errors.NotFoundError("Cluster not found");
  }
};

export const getClusterDetails = async ({
  clusterId,
}: {
  clusterId: string;
}): Promise<{
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  lastPingAt: Date | null;
  additionalContext: VersionedTexts | null;
  debug: boolean;
  enableCustomAuth: boolean;
  handleCustomAuthFunction: string;
  enableKnowledgebase: boolean;
}> => {
  const [clusters, machines] = await Promise.all([
    data.db
      .select({
        id: data.clusters.id,
        name: data.clusters.name,
        description: data.clusters.description,
        createdAt: data.clusters.created_at,
        additionalContext: data.clusters.additional_context,
        debug: data.clusters.debug,
        enableCustomAuth: data.clusters.enable_custom_auth,
        handleCustomAuthFunction: data.clusters.handle_custom_auth_function,
        enableKnowledgebase: data.clusters.enable_knowledgebase,
      })
      .from(data.clusters)
      .where(and(eq(data.clusters.id, clusterId))),
    data.db
      .select({
        clusterId: data.machines.cluster_id,
        maxLastPingAt: max(data.machines.last_ping_at),
      })
      .from(data.machines)
      .where(
        and(
          eq(data.machines.cluster_id, clusterId),
          gte(data.machines.last_ping_at, new Date(Date.now() - 1000 * 60 * 60 * 1))
        )
      )
      .groupBy(data.machines.cluster_id),
  ]);

  const cluster = clusters[0];

  if (!cluster) {
    throw new errors.NotFoundError("Cluster not found");
  }

  return {
    id: cluster.id,
    name: cluster.name,
    description: cluster.description,
    createdAt: cluster.createdAt,
    debug: cluster.debug,
    additionalContext: cluster.additionalContext,
    lastPingAt: machines[0]?.maxLastPingAt,
    enableCustomAuth: cluster.enableCustomAuth,
    handleCustomAuthFunction: cluster.handleCustomAuthFunction,
    enableKnowledgebase: cluster.enableKnowledgebase,
  };
};

export const getClusterMachines = async ({ clusterId }: { clusterId: string }) => {
  const machines = await data.db
    .select({
      id: data.machines.id,
      lastPingAt: data.machines.last_ping_at,
      ip: data.machines.ip,
      sdkVersion: data.machines.sdk_version,
      sdkLanguage: data.machines.sdk_language,
    })
    .from(data.machines)
    .where(eq(data.machines.cluster_id, clusterId));

  return machines;
};
