import { and, countDistinct, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { omitBy } from "lodash";
import { ulid } from "ulid";
import { env } from "../../utilities/env";
import {
  BadRequestError,
  NotFoundError,
  PaymentRequiredError,
  RunBusyError,
} from "../../utilities/errors";
import { clusters, db, jobs, RunMessageMetadata, runMessages, runs, runTags } from "../data";
import { ChatIdentifiers } from "../models/routing";
import { logger } from "../observability/logger";
import { injectTraceContext } from "../observability/tracer";
import { runGenerateNameQueue } from "../queues/run-name-generation";
import { runProcessQueue } from "../queues/run-process";
import { trackCustomerTelemetry } from "../track-customer-telemetry";
import {
  getMessageCountForCluster,
  getRunMessages,
  hasInvocations,
  insertRunMessage,
  lastAgentMessage,
} from "./messages";
import { getRunTags } from "./tags";

export const createRun = async ({
  id,
  userId,
  clusterId,
  name,
  test,
  testMocks,
  systemPrompt,
  onStatusChangeHandler,
  onStatusChangeStatuses,
  resultSchema,
  tags,
  attachedFunctions,
  agentId,
  agentVersion,
  interactive,
  reasoningTraces,
  enableSummarization,
  modelIdentifier,
  authContext,
  context,
  enableResultGrounding,
}: {
  id?: string;
  userId?: string;
  clusterId: string;
  name?: string;
  systemPrompt?: string;
  test?: boolean;
  testMocks?: Record<
    string,
    {
      output: Record<string, unknown>;
    }
  >;
  onStatusChangeHandler?: string;
  onStatusChangeStatuses?: string[];
  resultSchema?: unknown;
  tags?: Record<string, string>;
  attachedFunctions?: string[];
  agentId?: string;
  agentVersion?: number;
  interactive?: boolean;
  reasoningTraces?: boolean;
  enableSummarization?: boolean;
  modelIdentifier?: ChatIdentifiers;
  authContext?: Record<string, unknown>;
  context?: unknown;
  enableResultGrounding?: boolean;
}) => {
  const resultSet = {
    id: runs.id,
    name: runs.name,
    clusterId: runs.cluster_id,
    systemPrompt: runs.system_prompt,
    status: runs.status,
    debug: runs.debug,
    test: runs.test,
    attachedFunctions: runs.attached_functions,
    modelIdentifier: runs.model_identifier,
    authContext: runs.auth_context,
    context: runs.context,
    interactive: runs.interactive,
    enableResultGrounding: runs.enable_result_grounding,
    agentId: runs.agent_id,
  } as const;

  // Insert the run with a subquery for debug value
  const [run] = await db
    .insert(runs)
    .values({
      id: id ?? ulid(),
      cluster_id: clusterId,
      status: "pending",
      user_id: userId ?? "SYSTEM",
      ...(name ? { name } : {}),
      debug: sql<boolean>`(SELECT debug FROM ${clusters} WHERE id = ${clusterId})`,
      system_prompt: systemPrompt,
      test,
      test_mocks: testMocks,
      reasoning_traces: reasoningTraces,
      interactive: interactive,
      enable_summarization: enableSummarization,
      on_status_change: onStatusChangeHandler,
      on_status_change_statuses: onStatusChangeStatuses,
      result_schema: resultSchema,
      attached_functions: attachedFunctions,
      agent_id: agentId,
      agent_version: agentVersion,
      model_identifier: modelIdentifier,
      auth_context: {
        ...authContext,
        userId,
      },
      context: context,
      enable_result_grounding: enableResultGrounding,
    })
    .onConflictDoNothing()
    .returning(resultSet);

  if (!run) {
    if (id) {
      return db
        .select(resultSet)
        .from(runs)
        .where(and(eq(runs.id, id), eq(runs.cluster_id, clusterId)))
        .limit(1)
        .then(result => {
          return {
            ...result[0],
            created: false,
          };
        });
    }

    throw new Error("Failed to create run");
  }

  // Send the run to be processed
  await runProcessQueue
    .send({
      runId: run.id,
      clusterId,
      ...injectTraceContext(),
    })
    .catch(e => {
      logger.error("Failed to send run to process queue", { error: e });
    });

  // Insert tags if provided
  if (tags) {
    await db.insert(runTags).values(
      Object.entries(tags).map(([key, value]) => ({
        cluster_id: clusterId,
        workflow_id: run.id,
        key,
        value,
      }))
    );
  }

  return {
    ...run,
    created: true,
  };
};

export const deleteRun = async ({ clusterId, runId }: { clusterId: string; runId: string }) => {
  await db.delete(runs).where(and(eq(runs.cluster_id, clusterId), eq(runs.id, runId)));
};

export const updateRunFeedback = async (run: {
  id: string;
  clusterId: string;
  feedbackComment?: string;
  feedbackScore?: number;
}) => {
  await db
    .update(runs)
    .set({ feedback_comment: run.feedbackComment, feedback_score: run.feedbackScore })
    .where(and(eq(runs.cluster_id, run.clusterId), eq(runs.id, run.id)));
};

/**
 * @deprecated This function is deprecated and will be removed in a future version.
 * Create domain specific functions to update run status, name, etc, or db.update within the module
 */
export const updateRun = async (run: {
  id: string;
  clusterId: string;
  name?: string;
  status?: "pending" | "running" | "paused" | "done" | "failed" | null;
  failureReason?: string;
  feedbackComment?: string;
  feedbackScore?: number;
}) => {
  logger.error("updateRun is deprecated. but called in production");

  const updateSet = {
    name: run.name ?? undefined,
    status: run.status ?? undefined,
    failure_reason: run.failureReason ?? undefined,
    feedback_comment: run.feedbackComment ?? undefined,
    feedback_score: run.feedbackScore ?? undefined,
  };

  if (run.status && run.status !== "failed") {
    updateSet.failure_reason = "";
  }

  const [updated] = await db
    .update(runs)
    .set(omitBy(updateSet, value => value === undefined))
    .where(and(eq(runs.cluster_id, run.clusterId), eq(runs.id, run.id)))
    .returning({
      id: runs.id,
      name: runs.name,
      clusterId: runs.cluster_id,
      status: runs.status,
      failureReason: runs.failure_reason,
      debug: runs.debug,
      attachedFunctions: runs.attached_functions,
      authContext: runs.auth_context,
      context: runs.context,
      interactive: runs.interactive,
      enableResultGrounding: runs.enable_result_grounding,
    });

  // Send telemetry event if feedback was updated
  if (run.feedbackScore !== undefined && run.feedbackScore !== null) {
    trackCustomerTelemetry({
      type: "runFeedback",
      runId: run.id,
      clusterId: run.clusterId,
      score: run.feedbackScore,
      comment: run.feedbackComment || undefined,
    });
  }

  return updated;
};

export const getRun = async ({ clusterId, runId }: { clusterId: string; runId: string }) => {
  const [run] = await db
    .select({
      id: runs.id,
      name: runs.name,
      userId: runs.user_id,
      agentId: runs.agent_id,
      clusterId: runs.cluster_id,
      systemPrompt: runs.system_prompt,
      status: runs.status,
      failureReason: runs.failure_reason,
      debug: runs.debug,
      test: runs.test,
      testMocks: runs.test_mocks,
      onStatusChange: runs.on_status_change,
      onStatusChangeStatuses: runs.on_status_change_statuses,
      resultSchema: runs.result_schema,
      feedbackComment: runs.feedback_comment,
      feedbackScore: runs.feedback_score,
      attachedFunctions: runs.attached_functions,
      reasoningTraces: runs.reasoning_traces,
      interactive: runs.interactive,
      enableSummarization: runs.enable_summarization,
      modelIdentifier: runs.model_identifier,
      authContext: runs.auth_context,
      context: runs.context,
      enableResultGrounding: runs.enable_result_grounding,
    })
    .from(runs)
    .where(and(eq(runs.cluster_id, clusterId), eq(runs.id, runId)));

  return run;
};

export const getClusterRuns = async ({
  clusterId,
  userId,
  test,
  limit = 50,
  agentId,
}: {
  clusterId: string;
  test: boolean;
  userId?: string;
  limit?: number;
  agentId?: string;
}) => {
  const result = await db
    .select({
      id: runs.id,
      name: runs.name,
      userId: runs.user_id,
      clusterId: runs.cluster_id,
      systemPrompt: runs.system_prompt,
      status: runs.status,
      createdAt: runs.created_at,
      failureReason: runs.failure_reason,
      debug: runs.debug,
      test: runs.test,
      agentId: runs.agent_id,
      agentVersion: runs.agent_version,
      feedbackScore: runs.feedback_score,
      modelIdentifier: runs.model_identifier,
      authContext: runs.auth_context,
      context: runs.context,
      enableResultGrounding: runs.enable_result_grounding,
    })
    .from(runs)
    .where(
      and(
        eq(runs.cluster_id, clusterId),
        eq(runs.test, test),
        ...(userId ? [eq(runs.user_id, userId)] : []),
        ...(agentId ? [eq(runs.agent_id, agentId)] : [])
      )
    )
    .orderBy(desc(runs.created_at))
    .limit(limit);

  return result;
};

export const getRunDetails = async ({ clusterId, runId }: { clusterId: string; runId: string }) => {
  const [[run], agentMessage, tags] = await Promise.all([
    db
      .select({
        id: runs.id,
        name: runs.name,
        userId: runs.user_id,
        clusterId: runs.cluster_id,
        status: runs.status,
        systemPrompt: runs.system_prompt,
        failureReason: runs.failure_reason,
        debug: runs.debug,
        test: runs.test,
        feedbackComment: runs.feedback_comment,
        feedbackScore: runs.feedback_score,
        attachedFunctions: runs.attached_functions,
        modelIdentifier: runs.model_identifier,
        authContext: runs.auth_context,
        context: runs.context,
        enableResultGrounding: runs.enable_result_grounding,
      })
      .from(runs)
      .where(and(eq(runs.cluster_id, clusterId), eq(runs.id, runId))),
    lastAgentMessage({ clusterId, runId }),
    getRunTags({ clusterId, runId }),
  ]);

  return {
    ...run,
    tags,
    // Currently a Run can have multiple "results".
    // For now, we just use the last result.
    result: agentMessage?.type === "agent" ? agentMessage.data.result : null,
  };
};

export const assertEphemeralClusterLimitations = async (clusterId: string) => {
  if (clusterId.startsWith("eph_")) {
    const count = await getMessageCountForCluster(clusterId);

    if (count > 30) {
      throw new PaymentRequiredError("Ephemeral cluster has reached the message limit");
    }
  }
};

export const addMessageAndResume = async ({
  userId,
  id,
  clusterId,
  runId,
  message,
  type,
  metadata,
  skipAssert,
}: {
  userId?: string;
  id: string;
  clusterId: string;
  runId: string;
  message: string;
  type: "human" | "template" | "supervisor";
  metadata?: RunMessageMetadata;
  skipAssert?: boolean;
}) => {
  if (!skipAssert) {
    await assertRunReady({ clusterId, runId });
  }

  await insertRunMessage({
    userId,
    clusterId,
    runId,
    data: {
      message,
    },
    type,
    id,
    metadata,
  });

  await Promise.all([
    resumeRun({
      id: runId,
      clusterId,
    }),
    runGenerateNameQueue.send({
      runId,
      clusterId,
      content: message,
    }),
  ]);
};

export const resumeRun = async (input: { id: string; clusterId: string }) => {
  if (env.NODE_ENV === "test") {
    logger.warn("Skipping run resume. NODE_ENV is set to 'test'.");
    return;
  }

  if (input.id === getClusterBackgroundRun(input.clusterId)) {
    logger.debug("Skipping background run resume", {
      runId: input.id,
      clusterId: input.clusterId,
    });
    return;
  }

  await runProcessQueue
    .send({
      runId: input.id,
      clusterId: input.clusterId,
      ...injectTraceContext(),
    })
    .catch((error: Error) => {
      logger.error("Failed to send run to process queue", { error });
    });

  logger.info("Added run processing job to queue");
};

export type RunMessage = {
  message: string;
  type: "human" | "template";
  messageMetadata?: RunMessageMetadata;
};

export const createRunWithMessage = async ({
  id,
  userId,
  clusterId,
  message,
  systemPrompt,
  type,
  name,
  test,
  testMocks,
  messageMetadata,
  resultSchema,
  tags,
  attachedFunctions,
  agentId,
  agentVersion,
  reasoningTraces,
  interactive,
  enableSummarization,
  modelIdentifier,
  onStatusChangeHandler,
  onStatusChangeStatuses,
  authContext,
  context,
  enableResultGrounding,
}: Parameters<typeof createRun>[0] & RunMessage) => {
  const run = await createRun({
    id,
    userId,
    clusterId,
    name,
    test,
    testMocks,
    systemPrompt,
    onStatusChangeHandler,
    onStatusChangeStatuses,
    attachedFunctions,
    resultSchema,
    tags,
    agentId,
    agentVersion,
    reasoningTraces,
    interactive,
    enableSummarization,
    modelIdentifier,
    authContext,
    context,
    enableResultGrounding,
  });

  await addMessageAndResume({
    id: ulid(),
    userId,
    clusterId,
    runId: run.id,
    message,
    type,
    metadata: messageMetadata,
    skipAssert: true,
  });

  return run;
};

/**
 * A background run allows calls that are not associated with a specific run to have a home.
 * @param clusterId - The cluster ID
 * @returns A unique ID for the background run
 */
export const getClusterBackgroundRun = (clusterId: string) => {
  return `${clusterId}BACKGROUND`;
};

export const assertableRun = async ({ runId, clusterId }: { runId: string; clusterId: string }) => {
  const [run] = await db
    .select({
      status: runs.status,
      interactive: runs.interactive,
    })
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.cluster_id, clusterId)));

  return run;
};

export const assertRunReady = async (input: { clusterId: string; runId: string }) => {
  const run = await assertableRun(input);

  if (!run) {
    throw new NotFoundError("Run not found");
  }

  logger.info("Asserting run is ready", {
    runId: input.runId,
    status: run.status,
  });

  if (!run.interactive) {
    throw new BadRequestError("Run is not interactive and cannot accept new messages.");
  }

  const acceptedStatuses = ["done", "failed", "pending", "paused"];
  if (!acceptedStatuses.includes(run.status ?? "")) {
    throw new RunBusyError(`Run is not ready for new messages: ${run.status}`);
  }

  const [lastMessage] = await getRunMessages({
    clusterId: input.clusterId,
    runId: input.runId,
    limit: 1,
  });

  if (!lastMessage) {
    return;
  }

  if (lastMessage.type === "agent") {
    // Only Agent messages without function calls are considered ready
    if (!hasInvocations(lastMessage)) {
      return;
    }
  }

  logger.info("Run has unprocessed messages. Run will be resumed.", {
    status: run.status,
  });

  await resumeRun({
    clusterId: input.clusterId,
    id: input.runId,
  });

  throw new RunBusyError("Run is not ready for new messages: Unprocessed messages");
};

export const getWaitingJobIds = async ({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}) => {
  const waitingJobs = await db
    .select({
      id: jobs.id,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.workflow_id, runId),
        eq(jobs.cluster_id, clusterId),
        or(
          inArray(jobs.status, ["pending", "running"]),
          and(eq(jobs.approval_requested, true), isNull(jobs.approved))
        )
      )
    );

  return waitingJobs.map(job => job.id);
};

export const getAgentMetrics = async ({
  clusterId,
  agentId,
}: {
  clusterId: string;
  agentId: string;
}) => {
  return db
    .select({
      createdAt: runs.created_at,
      count: countDistinct(runs.id).as("count"),
      feedbackScore: runs.feedback_score,
      jobCount: countDistinct(jobs.id).as("job_count"),
      jobFailureCount: sql<number>`COUNT(${jobs.id}) FILTER (WHERE ${jobs.status} = 'failure')`.as(
        "job_failure_count"
      ),
      timeToCompletion: sql<number>`
        EXTRACT(EPOCH FROM (
          MAX(${runMessages.created_at}) - MIN(${runMessages.created_at})
        ))
      `.as("time_to_completion"),
    })
    .from(runs)
    .leftJoin(jobs, eq(runs.id, jobs.workflow_id))
    .leftJoin(runMessages, eq(runs.id, runMessages.workflow_id))
    .where(and(eq(runs.cluster_id, clusterId), eq(runs.agent_id, agentId)))
    .groupBy(runs.id, runs.created_at, runs.feedback_score)
    .limit(1000);
};

export const createRetry = async ({ clusterId, runId }: { clusterId: string; runId: string }) => {
  await db
    .update(runs)
    .set({
      status: "pending",
      failure_reason: null,
    })
    .where(eq(runs.id, runId));

  await resumeRun({
    clusterId,
    id: runId,
  });
};
