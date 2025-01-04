import { and, desc, eq, gte } from "drizzle-orm";
import { ulid } from "ulid";
import { InvalidJobArgumentsError, NotFoundError } from "../../utilities/errors";
import * as data from "../data";
import * as events from "../observability/events";
import { FunctionConfig, getServiceDefinition, parseJobArgs } from "../service-definitions";
import { extractWithJsonPath } from "../util";
import { env } from "../../utilities/env";
import { injectTraceContext } from "../observability/tracer";
import { logger } from "../observability/logger";
import { sqs } from "../sqs";
import { externalServices } from "../integrations/constants";
import { jobDefaults } from "../data";

type CreateJobParams = {
  jobId: string;
  service: string;
  targetFn: string;
  targetArgs: string;
  owner: { clusterId: string };
  pool?: string;
  timeoutIntervalSeconds?: number;
  maxAttempts: number;
  runId: string;
  authContext?: unknown;
  runContext?: unknown;
};

const extractCacheKeyFromJsonPath = (path: string, args: unknown) => {
  try {
    return extractWithJsonPath(path, args)[0];
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new InvalidJobArgumentsError(
        `Failed to extract cache key from arguments: ${error.message}`,
        "https://docs.inferable.ai/pages/functions#config-cache"
      );
    }
    throw error;
  }
};

export const createJob = async (params: {
  service: string;
  targetFn: string;
  targetArgs: string;
  owner: { clusterId: string };
  runId: string;
  authContext?: unknown;
  runContext?: unknown;
  schemaUnavailableRetryCount?: number;
  toolCallId?: string;
}): Promise<{
  id: string;
  created: boolean;
}> => {
  const serviceDefinition = await getServiceDefinition({
    owner: params.owner,
    service: params.service,
  });

  const { config, schema } =
    serviceDefinition?.functions?.find(f => f.name === params.targetFn) ?? {};

  // sometimes the schema is not available immediately after the service is
  // registered, so we retry a few times
  if (!schema && (params.schemaUnavailableRetryCount ?? 0) < 3) {
    // wait for the service to be available
    await new Promise(resolve => setTimeout(resolve, 1000));

    // retry
    return createJob({
      ...params,
      schemaUnavailableRetryCount: (params.schemaUnavailableRetryCount ?? 0) + 1,
    });
  }

  const args = await parseJobArgs({
    schema,
    args: params.targetArgs,
  });

  const jobConfig = {
    timeoutIntervalSeconds: config?.timeoutSeconds ?? jobDefaults.timeoutIntervalSeconds,
    maxAttempts: config?.retryCountOnStall
      ? config?.retryCountOnStall + 1
      : jobDefaults.maxAttempts,
    jobId: params.toolCallId ?? ulid(),
  };

  if (config?.cache?.keyPath && config?.cache?.ttlSeconds) {
    const cacheKey = extractCacheKeyFromJsonPath(config.cache.keyPath, args);

    const { id, created } = await createJobStrategies.cached({
      ...jobConfig,
      service: params.service,
      targetFn: params.targetFn,
      targetArgs: params.targetArgs,
      owner: params.owner,
      cacheKey: cacheKey,
      cacheTTLSeconds: config.cache.ttlSeconds,
      runId: params.runId,
      authContext: params.authContext,
      runContext: params.runContext,
    });

    if (created) {
      onAfterJobCreated({
        ...params,
        ...jobConfig,
        config,
        jobId: id,
      });
    }

    return { id, created };
  } else {
    const { id, created } = await createJobStrategies.default({
      ...jobConfig,
      service: params.service,
      targetFn: params.targetFn,
      targetArgs: params.targetArgs,
      owner: params.owner,
      runId: params.runId,
      authContext: params.authContext,
      runContext: params.runContext,
    });

    if (created) {
      onAfterJobCreated({
        ...params,
        ...jobConfig,
        config,
        jobId: id,
      });
    }

    // end();
    return { id, created };
  }
};

const createJobStrategies = {
  cached: async ({
    service,
    targetFn,
    targetArgs,
    owner,
    cacheTTLSeconds,
    cacheKey,
    timeoutIntervalSeconds,
    maxAttempts,
    jobId,
    runId,
    authContext,
    runContext,
  }: CreateJobParams & {
    cacheKey: string;
    cacheTTLSeconds: number;
  }) => {
    // has a job been completed within the TTL?
    // if so, return the jobId
    const [job] = await data.db
      .select({
        id: data.jobs.id,
      })
      .from(data.jobs)
      .where(
        and(
          eq(data.jobs.cache_key, cacheKey),
          eq(data.jobs.cluster_id, owner.clusterId),
          eq(data.jobs.service, service),
          eq(data.jobs.target_fn, targetFn),
          eq(data.jobs.status, "success"),
          eq(data.jobs.result_type, "resolution"),
          gte(data.jobs.resulted_at, new Date(Date.now() - cacheTTLSeconds * 1000))
        )
      )
      .orderBy(desc(data.jobs.resulted_at))
      .limit(1);

    if (job) {
      return { id: job.id, created: false };
    }

    const [inserted] = await data.db
      .insert(data.jobs)
      .values({
        id: jobId,
        target_fn: targetFn,
        target_args: targetArgs,
        status: "pending",
        cluster_id: owner.clusterId,
        service,
        cache_key: cacheKey,
        remaining_attempts: maxAttempts,
        timeout_interval_seconds: timeoutIntervalSeconds,
        workflow_id: runId,
        auth_context: authContext,
        run_context: runContext,
      })
      .returning({ id: data.jobs.id })
      .onConflictDoNothing();

    return { id: jobId, created: !!inserted };
  },
  default: async ({
    service,
    targetFn,
    targetArgs,
    owner,
    timeoutIntervalSeconds,
    maxAttempts,
    jobId,
    runId,
    authContext,
    runContext,
  }: CreateJobParams) => {
    const [inserted] = await data.db
      .insert(data.jobs)
      .values({
        id: jobId,
        target_fn: targetFn,
        target_args: targetArgs,
        status: "pending",
        cluster_id: owner.clusterId,
        service,
        remaining_attempts: maxAttempts,
        timeout_interval_seconds: timeoutIntervalSeconds,
        workflow_id: runId,
        auth_context: authContext,
        run_context: runContext,
      })
      .returning({ id: data.jobs.id })
      .onConflictDoNothing();

    return { id: jobId, created: !!inserted };
  },
};

const onAfterJobCreated = async ({
  service,
  targetFn,
  targetArgs,
  owner,
  jobId,
  runId,
  config,
}: CreateJobParams & { jobId: string; config?: FunctionConfig }) => {
  events.write({
    type: "jobCreated",
    clusterId: owner.clusterId,
    jobId,
    targetFn,
    service,
    meta: {
      targetArgs,
      config,
    },
  });

  if (externalServices.includes(service)) {
    await sqs
      .sendMessage({
        QueueUrl: env.SQS_EXTERNAL_TOOL_CALL_QUEUE_URL,
        MessageBody: JSON.stringify({
          clusterId: owner.clusterId,
          runId,
          callId: jobId,
          service,
          ...injectTraceContext(),
        }),
      })
      .catch(e => {
        logger.error("Failed to send external call to SQS", { error: e });
      });
  }
};
