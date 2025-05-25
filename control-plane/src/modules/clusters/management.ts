import { and, count, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { ulid } from "ulid";
import uniqBy from "lodash/uniqBy";
import { createCache } from "../../utilities/cache";
import * as errors from "../../utilities/errors";
import * as data from "../data";
import { randomName } from "../../utilities/names";
import { createApiKey } from "../auth/cluster";
import { rateLimiter } from "../../utilities/rate-limiter";

const clusterDetailsCache = createCache<
  Awaited<ReturnType<typeof getClusterDetails>>
>(Symbol("clusterDetails"));

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

  if (clusters.length === 0) {
    await createCluster({
      name: "My Demo Cluster",
      organizationId,
      description: "Demo cluster auto-created by Inferable",
    });

    return data.db
      .select({
        id: data.clusters.id,
        name: data.clusters.name,
        createdAt: data.clusters.created_at,
        description: data.clusters.description,
        isDemo: data.clusters.is_demo,
      })
      .from(data.clusters)
      .where(eq(data.clusters.organization_id, organizationId));
  }

  return clusters;
};

export const createEphemeralSetup = async (
  ip: string,
): Promise<{
  clusterId: string;
  apiKey: string;
  ip: string;
}> => {
  const limiter = rateLimiter({ window: "hour", ceiling: 10 });
  const allowed = limiter.allowed(`ephemeral-setup:${ip}`, 1);

  if (!allowed) {
    throw new errors.TooManyRequestsError(
      "Too many ephemeral setups for this IP. Try again in 1h.",
    );
  } else {
    await limiter.consume(`ephemeral-setup:${ip}`, 1);
  }

  const cluster = await createCluster({
    name: "Ephemeral Cluster",
    organizationId: "ephemeral",
    description: `Ephemeral cluster created by ${ip}`,
    isEphemeral: true,
  });

  const { key: apiKey } = await createApiKey({
    clusterId: cluster.id,
    createdBy: "anonymous",
    name: "ephemeral-default",
  });

  return {
    clusterId: cluster.id,
    apiKey,
    ip,
  };
};

export const createCluster = async ({
  name,
  organizationId,
  description,
  isDemo,
  isEphemeral,
}: {
  name?: string;
  organizationId: string;
  description: string;
  isDemo?: boolean;
  isEphemeral?: boolean;
}): Promise<{
  id: string;
  name: string;
}> => {
  const id = isEphemeral ? `eph_${ulid()}` : ulid();

  return data.db
    .insert(data.clusters)
    .values([
      {
        id,
        name: name || `${randomName(" ")}`,
        organization_id: organizationId,
        description,
        is_demo: isDemo,
        is_ephemeral: isEphemeral,
      },
    ])
    .returning({
      id: data.clusters.id,
      name: data.clusters.name,
    })
    .execute()
    .then(r => r[0]);
};

export const markClusterForDeletion = async ({
  clusterId,
}: {
  clusterId: string;
}) => {
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
  debug,
  enableCustomAuth,
  handleCustomAuthFunction,
  enableKnowledgebase,
  eventExpiryAge,
  workflowExecutionExpiryAge,
}: {
  organizationId: string;
  clusterId: string;
  name?: string;
  description?: string;
  debug?: boolean;
  enableCustomAuth?: boolean;
  handleCustomAuthFunction?: string;
  enableKnowledgebase?: boolean;
  eventExpiryAge?: number | null;
  workflowExecutionExpiryAge?: number | null;
}) => {
  const validateExpiry = (expiryAge: number) => {
    if ([60, 3600, 86400, 604800].indexOf(expiryAge) === -1) {
      throw new errors.BadRequestError(
        "Expiry age must be one of (1 minute, hour, day or week)",
      );
    }
  };

  if (eventExpiryAge) {
    validateExpiry(eventExpiryAge);
  }

  if (workflowExecutionExpiryAge) {
    validateExpiry(workflowExecutionExpiryAge);
  }

  const clusters = await data.db
    .update(data.clusters)
    .set({
      description,
      name,
      debug,
      enable_custom_auth: enableCustomAuth,
      handle_custom_auth_function: handleCustomAuthFunction,
      enable_knowledgebase: enableKnowledgebase,
      event_expiry_age: eventExpiryAge,
      workflow_execution_expiry_age: workflowExecutionExpiryAge,
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
  createdAt: number;
  debug: boolean;
  isDemo: boolean;
  handleCustomAuthFunction: string | null;
  enableCustomAuth: boolean;
  eventExpiryAge: number | null;
  workflowExecutionExpiryAge: number | null;
  machines: Array<{
    id: string;
    lastPingAt: number | null;
    ip: string | null;
    sdkVersion: string | null;
    sdkLanguage: string | null;
  }>;
  tools: Array<{
    name: string;
    description: string | null;
    schema: unknown | null;
    config: unknown | null;
    lastPingAt: number | null;
    shouldExpire: boolean;
    createdAt: number;
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
      handleCustomAuthFunction: data.clusters.handle_custom_auth_function,
      enableCustomAuth: data.clusters.enable_custom_auth,
      additionalContext: data.clusters.additional_context,
      eventExpiryAge: data.clusters.event_expiry_age,
      workflowExecutionExpiryAge: data.clusters.workflow_execution_expiry_age,
      machineId: data.machines.id,
      machineLastPingAt: data.machines.last_ping_at,
      machineIp: data.machines.ip,
      machineSdkVersion: data.machines.sdk_version,
      machineSdkLanguage: data.machines.sdk_language,
      serviceService: data.services.service,
      serviceDefinition: data.services.definition,
      serviceTimestamp: data.services.timestamp,
      toolName: data.tools.name,
      toolDescription: data.tools.description,
      toolSchema: data.tools.schema,
      toolConfig: data.tools.config,
      toolShouldExpire: data.tools.should_expire,
      toolLastPingAt: data.tools.last_ping_at,
      toolCreatedAt: data.tools.created_at,
    })
    .from(data.clusters)
    .leftJoin(data.machines, eq(data.machines.cluster_id, data.clusters.id))
    .leftJoin(data.services, eq(data.services.cluster_id, data.clusters.id))
    .leftJoin(data.tools, eq(data.tools.cluster_id, data.clusters.id))
    .where(eq(data.clusters.id, clusterId));

  if (results.length === 0) {
    throw new errors.NotFoundError("Cluster not found");
  }

  const response = {
    id: results[0].id,
    name: results[0].name,
    description: results[0].description,
    createdAt: results[0].createdAt?.getTime() ?? 0,
    debug: results[0].debug,
    isDemo: results[0].isDemo,
    handleCustomAuthFunction: results[0].handleCustomAuthFunction ?? null,
    enableCustomAuth: results[0].enableCustomAuth,
    eventExpiryAge: results[0].eventExpiryAge ?? null,
    workflowExecutionExpiryAge: results[0].workflowExecutionExpiryAge ?? null,
    machines: uniqBy(
      results
        .filter(r => r.machineId !== null)
        .map(r => ({
          id: r.machineId!,
          lastPingAt: r.machineLastPingAt?.getTime() ?? null,
          ip: r.machineIp,
          sdkVersion: r.machineSdkVersion,
          sdkLanguage: r.machineSdkLanguage,
        })),
      r => r.id,
    ),
    tools: uniqBy(
      results
        .filter(r => r.toolName !== null)
        .map(r => ({
          name: r.toolName!,
          description: r.toolDescription,
          schema: r.toolSchema as unknown,
          config: r.toolConfig as unknown,
          shouldExpire: r.toolShouldExpire ?? false,
          createdAt: r.toolCreatedAt?.getTime() ?? 0,
          lastPingAt: r.toolLastPingAt?.getTime() ?? null,
        })),
      r => r.name,
    ),
    additionalContext: results[0].additionalContext,
  } as const;

  await clusterDetailsCache.set(clusterId, response, 5);
  return response;
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
      sdkVersion: data.machines.sdk_version,
      sdkLanguage: data.machines.sdk_language,
    })
    .from(data.machines)
    .where(eq(data.machines.cluster_id, clusterId));

  return machines;
};
