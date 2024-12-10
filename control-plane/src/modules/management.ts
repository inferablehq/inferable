import { and, eq, gte, max } from "drizzle-orm";
import { ulid } from "ulid";
import * as errors from "../utilities/errors";
import * as data from "./data";
import { randomName } from "./names";
import {
  storedServiceDefinitionSchema,
} from "./service-definitions";
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
}: {
  name?: string;
  organizationId: string;
  description: string;
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
      },
    ])
    .returning({
      id: data.clusters.id,
      name: data.clusters.name,
    })
    .execute()
    .then((r) => r[0]);
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
  enableCustomerAuth,
  enableRunConfigs,
  enableKnowledgebase,
}: {
  organizationId: string;
  clusterId: string;
  name?: string;
  description?: string;
  additionalContext?: VersionedTexts;
  debug?: boolean;
  enableCustomerAuth?: boolean;
  enableRunConfigs?: boolean;
  enableKnowledgebase?: boolean;
}) => {
  const clusters = await data.db
    .update(data.clusters)
    .set({
      description,
      name,
      additional_context: additionalContext,
      debug,
      enable_customer_auth: enableCustomerAuth,
      enable_run_configs: enableRunConfigs,
      enable_knowledgebase: enableKnowledgebase,
    })
    .where(
      and(
        eq(data.clusters.id, clusterId),
        eq(data.clusters.organization_id, organizationId),
      ),
    )
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
  enableCustomerAuth: boolean;
  enableRunConfigs: boolean;
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
        enableCustomerAuth: data.clusters.enable_customer_auth,
        enableRunConfigs: data.clusters.enable_run_configs,
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
          gte(
            data.machines.last_ping_at,
            new Date(Date.now() - 1000 * 60 * 60 * 1),
          ),
        ),
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
    enableCustomerAuth: cluster.enableCustomerAuth,
    enableRunConfigs: cluster.enableRunConfigs,
    enableKnowledgebase: cluster.enableKnowledgebase,
  };
};

export const getClusterServices = async ({
  clusterId,
}: {
  clusterId: string;
}) => {
  const services = await data.db
    .select({
      definition: data.services.definition,
    })
    .from(data.services)
    .where(eq(data.services.cluster_id, clusterId));

  const serviceDefinitions = storedServiceDefinitionSchema.parse(
    services.map((s) => s.definition),
  );

  return serviceDefinitions;
};

export const getClusterMachines = async ({
  clusterId,
}: {
  clusterId: string;
}) => {
  const machines = await data.db
    .select({
      id: data.machines.id,
      lastPingAt: data.machines.last_ping_at,
      ip: data.machines.ip,
      status: data.machines.status,
    })
    .from(data.machines)
    .where(eq(data.machines.cluster_id, clusterId));

  return machines;
};
