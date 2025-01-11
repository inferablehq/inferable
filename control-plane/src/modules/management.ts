import { and, eq, gte, max } from "drizzle-orm";
import { ulid } from "ulid";
import * as errors from "../utilities/errors";
import * as data from "./data";
import { randomName } from "./names";
import { VersionedTexts } from "./versioned-text";
import { createCache } from "../utilities/cache";

const clusterDetailsCache = createCache<Awaited<ReturnType<typeof getClusterDetails>>>(
  Symbol("clusterDetails")
);

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
    isDemo: boolean;
  }>
> => {
  const clusters = await data.db
    .select({
      id: data.clusters.id,
      name: data.clusters.name,
      createdAt: data.clusters.created_at,
      description: data.clusters.description,
      isDemo: data.clusters.is_demo,
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
  debug: boolean;
  isDemo: boolean;
  machines: Array<{
    id: string;
    lastPingAt: Date | null;
    ip: string | null;
    sdkVersion: string | null;
    sdkLanguage: string | null;
  }>;
  services: Array<{
    service: string;
    definition: unknown | null;
    timestamp: Date | null;
  }>;
}> => {
  const cached = await clusterDetailsCache.get(clusterId);
  if (cached !== undefined) {
    return cached;
  }

  const results = await data.db
    .select({
      id: data.clusters.id,
      name: data.clusters.name,
      description: data.clusters.description,
      createdAt: data.clusters.created_at,
      debug: data.clusters.debug,
      isDemo: data.clusters.is_demo,
      machineId: data.machines.id,
      machineLastPingAt: data.machines.last_ping_at,
      machineIp: data.machines.ip,
      machineSdkVersion: data.machines.sdk_version,
      machineSdkLanguage: data.machines.sdk_language,
      serviceService: data.services.service,
      serviceDefinition: data.services.definition,
      serviceTimestamp: data.services.timestamp,
    })
    .from(data.clusters)
    .leftJoin(data.machines, eq(data.machines.cluster_id, data.clusters.id))
    .leftJoin(data.services, eq(data.services.cluster_id, data.clusters.id))
    .where(eq(data.clusters.id, clusterId));

  if (results.length === 0) {
    throw new errors.NotFoundError("Cluster not found");
  }

  const response = {
    id: results[0].id,
    name: results[0].name,
    description: results[0].description,
    createdAt: results[0].createdAt,
    debug: results[0].debug,
    isDemo: results[0].isDemo,
    machines: results
      .filter(r => r.machineId !== null)
      .map(r => ({
        id: r.machineId!,
        lastPingAt: r.machineLastPingAt,
        ip: r.machineIp,
        sdkVersion: r.machineSdkVersion,
        sdkLanguage: r.machineSdkLanguage,
      })),
    services: results
      .filter(r => r.serviceService !== null)
      .map(r => ({
        service: r.serviceService!,
        definition: r.serviceDefinition,
        timestamp: r.serviceTimestamp,
      })),
  };

  await clusterDetailsCache.set(clusterId, response, 5);
  return response;
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
