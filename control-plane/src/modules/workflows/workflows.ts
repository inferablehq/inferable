import {
  and,
  countDistinct,
  desc,
  eq,
  inArray,
  InferSelectModel,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { ulid } from "ulid";
import { env } from "../../utilities/env";
import { BadRequestError, NotFoundError, RunBusyError } from "../../utilities/errors";
import {
  clusters,
  db,
  jobs,
  RunMessageMetadata,
  workflowMessages,
  workflowMetadata,
  workflows,
} from "../data";
import { ChatIdentifiers } from "../models/routing";
import { logger } from "../observability/logger";
import { injectTraceContext } from "../observability/tracer";
import { sqs } from "../sqs";
import { trackCustomerTelemetry } from "../track-customer-telemetry";
import {
  getWorkflowMessages,
  hasInvocations,
  lastAgentMessage,
  prepMessagesForRetry,
  upsertRunMessage,
} from "./workflow-messages";
import { getRunMetadata } from "./metadata";

export { start, stop } from "./queues";

export type Run = {
  id: string;
  clusterId: string;
  status?: "pending" | "running" | "paused" | "done" | "failed" | null;
  name?: string | null;
  configId?: string | null;
  systemPrompt?: string | null;
  failureReason?: string | null;
  debug?: boolean;
  test?: boolean;
  testMocks?: InferSelectModel<typeof workflows>["test_mocks"];
  feedbackComment?: string | null;
  feedbackScore?: number | null;
  resultSchema?: unknown | null;
  attachedFunctions?: string[] | null;
  onStatusChange?: string | null;
  interactive?: boolean;
  reasoningTraces?: boolean;
  enableSummarization?: boolean;
  modelIdentifier?: ChatIdentifiers | null;
  authContext?: unknown | null;
  context?: unknown | null;
  enableResultGrounding?: boolean;
};

export const createRun = async ({
  runId,
  userId,
  clusterId,
  name,
  test,
  testMocks,
  systemPrompt,
  onStatusChange,
  resultSchema,
  metadata,
  attachedFunctions,
  configId,
  configVersion,
  interactive,
  reasoningTraces,
  enableSummarization,
  modelIdentifier,
  customAuthToken,
  authContext,
  context,
  enableResultGrounding,
}: {
  runId?: string;
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
  onStatusChange?: string;
  resultSchema?: unknown;
  metadata?: Record<string, string>;
  attachedFunctions?: string[];
  configId?: string;
  configVersion?: number;
  interactive?: boolean;
  reasoningTraces?: boolean;
  enableSummarization?: boolean;
  modelIdentifier?: ChatIdentifiers;
  customAuthToken?: string;
  authContext?: unknown;
  context?: unknown;
  enableResultGrounding?: boolean;
}): Promise<Run> => {
  let run: Run | undefined = undefined;

  await db.transaction(async tx => {
    // TODO: Resolve the run debug value via a subquery and remove the transaction: https://github.com/inferablehq/inferable/issues/389
    const [debugQuery] = await tx
      .select({
        debug: clusters.debug,
      })
      .from(clusters)
      .where(eq(clusters.id, clusterId));

    const result = await tx
      .insert(workflows)
      .values([
        {
          id: runId ?? ulid(),
          cluster_id: clusterId,
          status: "pending",
          user_id: userId ?? "SYSTEM",
          ...(name ? { name } : {}),
          debug: debugQuery.debug,
          system_prompt: systemPrompt,
          test,
          test_mocks: testMocks,
          reasoning_traces: reasoningTraces,
          interactive: interactive,
          enable_summarization: enableSummarization,
          on_status_change: onStatusChange,
          result_schema: resultSchema,
          attached_functions: attachedFunctions,
          config_id: configId,
          config_version: configVersion,
          model_identifier: modelIdentifier,
          custom_auth_token: customAuthToken,
          auth_context: authContext,
          context: context,
          enable_result_grounding: enableResultGrounding,
        },
      ])
      .returning({
        id: workflows.id,
        name: workflows.name,
        clusterId: workflows.cluster_id,
        systemPrompt: workflows.system_prompt,
        status: workflows.status,
        debug: workflows.debug,
        test: workflows.test,
        attachedFunctions: workflows.attached_functions,
        modelIdentifier: workflows.model_identifier,
        authContext: workflows.auth_context,
        context: workflows.context,
        interactive: workflows.interactive,
        enableResultGrounding: workflows.enable_result_grounding,
      });

    run = result[0];

    if (!!run && metadata) {
      await tx.insert(workflowMetadata).values(
        Object.entries(metadata).map(([key, value]) => ({
          cluster_id: clusterId,
          workflow_id: run!.id,
          key,
          value,
        }))
      );
    }
  });

  if (!run) {
    throw new Error("Failed to create run");
  }

  return run;
};

export const deleteRun = async ({ clusterId, runId }: { clusterId: string; runId: string }) => {
  await db
    .delete(workflows)
    .where(and(eq(workflows.cluster_id, clusterId), eq(workflows.id, runId)));
};

export const updateWorkflow = async (workflow: Run): Promise<Run> => {
  if (workflow.status && workflow.status !== "failed") {
    workflow.failureReason = null;
  }

  const [updated] = await db
    .update(workflows)
    .set({
      name: !workflow.name ? undefined : workflow.name,
      status: workflow.status,
      failure_reason: workflow.failureReason,
      feedback_comment: workflow.feedbackComment,
      feedback_score: workflow.feedbackScore,
    })
    .where(and(eq(workflows.cluster_id, workflow.clusterId), eq(workflows.id, workflow.id)))
    .returning({
      id: workflows.id,
      name: workflows.name,
      clusterId: workflows.cluster_id,
      status: workflows.status,
      failureReason: workflows.failure_reason,
      debug: workflows.debug,
      attachedFunctions: workflows.attached_functions,
      authContext: workflows.auth_context,
      context: workflows.context,
    });

  // Send telemetry event if feedback was updated
  if (workflow.feedbackScore !== undefined && workflow.feedbackScore !== null) {
    trackCustomerTelemetry({
      type: "runFeedback",
      runId: workflow.id,
      clusterId: workflow.clusterId,
      score: workflow.feedbackScore,
      comment: workflow.feedbackComment || undefined,
    });
  }

  return updated;
};

export const getRun = async ({ clusterId, runId }: { clusterId: string; runId: string }) => {
  const [workflow] = await db
    .select({
      id: workflows.id,
      name: workflows.name,
      userId: workflows.user_id,
      configId: workflows.config_id,
      clusterId: workflows.cluster_id,
      systemPrompt: workflows.system_prompt,
      status: workflows.status,
      failureReason: workflows.failure_reason,
      debug: workflows.debug,
      test: workflows.test,
      testMocks: workflows.test_mocks,
      onStatusChange: workflows.on_status_change,
      resultSchema: workflows.result_schema,
      feedbackComment: workflows.feedback_comment,
      feedbackScore: workflows.feedback_score,
      attachedFunctions: workflows.attached_functions,
      reasoningTraces: workflows.reasoning_traces,
      interactive: workflows.interactive,
      enableSummarization: workflows.enable_summarization,
      modelIdentifier: workflows.model_identifier,
      authContext: workflows.auth_context,
      context: workflows.context,
      enableResultGrounding: workflows.enable_result_grounding,
    })
    .from(workflows)
    .where(and(eq(workflows.cluster_id, clusterId), eq(workflows.id, runId)));

  return workflow;
};

export const getClusterWorkflows = async ({
  clusterId,
  userId,
  test,
  limit = 50,
  configId,
}: {
  clusterId: string;
  test: boolean;
  userId?: string;
  limit?: number;
  configId?: string;
}) => {
  const result = await db
    .select({
      id: workflows.id,
      name: workflows.name,
      userId: workflows.user_id,
      clusterId: workflows.cluster_id,
      systemPrompt: workflows.system_prompt,
      status: workflows.status,
      createdAt: workflows.created_at,
      failureReason: workflows.failure_reason,
      debug: workflows.debug,
      test: workflows.test,
      configId: workflows.config_id,
      configVersion: workflows.config_version,
      feedbackScore: workflows.feedback_score,
      modelIdentifier: workflows.model_identifier,
      authContext: workflows.auth_context,
      context: workflows.context,
      enableResultGrounding: workflows.enable_result_grounding,
    })
    .from(workflows)
    .where(
      and(
        eq(workflows.cluster_id, clusterId),
        eq(workflows.test, test),
        ...(userId ? [eq(workflows.user_id, userId)] : []),
        ...(configId ? [eq(workflows.config_id, configId)] : [])
      )
    )
    .orderBy(desc(workflows.created_at))
    .limit(limit);

  return result;
};

export const getWorkflowDetail = async ({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}) => {
  const [[workflow], agentMessage, metadata] = await Promise.all([
    db
      .select({
        id: workflows.id,
        name: workflows.name,
        userId: workflows.user_id,
        clusterId: workflows.cluster_id,
        status: workflows.status,
        systemPrompt: workflows.system_prompt,
        failureReason: workflows.failure_reason,
        debug: workflows.debug,
        test: workflows.test,
        feedbackComment: workflows.feedback_comment,
        feedbackScore: workflows.feedback_score,
        attachedFunctions: workflows.attached_functions,
        modelIdentifier: workflows.model_identifier,
        authContext: workflows.auth_context,
        context: workflows.context,
        enableResultGrounding: workflows.enable_result_grounding,
      })
      .from(workflows)
      .where(and(eq(workflows.cluster_id, clusterId), eq(workflows.id, runId))),
    lastAgentMessage({ clusterId, runId }),
    getRunMetadata({ clusterId, runId }),
  ]);

  return {
    ...workflow,
    metadata,
    // Current a workflow can have multiple "results".
    // For now, we just use the last result.
    // In the future, we will actually persist the workflow result.
    result: agentMessage?.data?.result ?? null,
  };
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

  await upsertRunMessage({
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

  // TODO: Move run name generation to event sourcing (pg-listen) https://github.com/inferablehq/inferable/issues/390
  await generateRunName(await getRun({ clusterId, runId }), message);

  await resumeRun({
    clusterId,
    id: runId,
  });
};

export const resumeRun = async (input: Pick<Run, "id" | "clusterId">) => {
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

  const sqsResult = await sqs.sendMessage({
    QueueUrl: env.SQS_RUN_PROCESS_QUEUE_URL,
    MessageBody: JSON.stringify({
      runId: input.id,
      clusterId: input.clusterId,
      ...injectTraceContext(),
    }),
  });

  logger.info("Added run processing job to queue", {
    messageId: sqsResult.MessageId,
  });
};

export const generateRunName = async (run: Run, content: string) => {
  if (env.NODE_ENV === "test") {
    logger.warn("Skipping run resume. NODE_ENV is set to 'test'.");
    return;
  }

  if (run.name) {
    logger.info("Skipping run name generation. Name already set.", {
      runId: run.id,
      name: run.name,
    });
    return;
  }

  const sqsResult = await sqs.sendMessage({
    QueueUrl: env.SQS_RUN_GENERATE_NAME_QUEUE_URL,
    MessageBody: JSON.stringify({
      runId: run.id,
      clusterId: run.clusterId,
      content,
      ...injectTraceContext(),
    }),
  });

  logger.info("Added name generation job to queue", {
    runId: run.id,
    messageId: sqsResult.MessageId,
  });
};

export type RunMessage = {
  message: string;
  type: "human" | "template";
  messageMetadata?: RunMessageMetadata;
};

export const createRunWithMessage = async ({
  runId,
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
  metadata,
  attachedFunctions,
  configId,
  configVersion,
  reasoningTraces,
  interactive,
  enableSummarization,
  modelIdentifier,
  onStatusChange,
  customAuthToken,
  authContext,
  context,
  enableResultGrounding,
}: Parameters<typeof createRun>[0] & RunMessage) => {
  const workflow = await createRun({
    runId,
    userId,
    clusterId,
    name,
    test,
    testMocks,
    systemPrompt,
    onStatusChange,
    attachedFunctions,
    resultSchema,
    metadata,
    configId,
    configVersion,
    reasoningTraces,
    interactive,
    enableSummarization,
    modelIdentifier,
    customAuthToken,
    authContext,
    context,
    enableResultGrounding,
  });

  await addMessageAndResume({
    id: ulid(),
    userId,
    clusterId,
    runId: workflow.id,
    message,
    type,
    metadata: messageMetadata,
    skipAssert: true,
  });

  return workflow;
};

/**
 * A background run allows calls that are not associated with a specific run to have a home.
 * @param clusterId - The cluster ID
 * @returns A unique ID for the background run
 */
export const getClusterBackgroundRun = (clusterId: string) => {
  return `${clusterId}BACKGROUND`;
};

export const assertRunReady = async (input: { runId: string; clusterId: string }) => {
  const run = await getRun(input);
  if (!run) {
    throw new NotFoundError("Run not found");
  }

  logger.info("Asserting run is ready", {
    runId: run.id,
    status: run.status,
  });

  if (!run.interactive) {
    throw new BadRequestError("Run is not interactive and cannot accept new messages.");
  }

  const acceptedStatuses = ["done", "failed", "pending", "paused"];
  if (!acceptedStatuses.includes(run.status ?? "")) {
    throw new RunBusyError(`Run is not ready for new messages: ${run.status}`);
  }

  const [lastMessage] = await getWorkflowMessages({
    clusterId: run.clusterId,
    runId: run.id,
    last: 1,
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

  logger.info("Run has unprocessed messages. Workflow will be resumed.", {
    status: run.status,
  });

  await resumeRun({
    clusterId: run.clusterId,
    id: run.id,
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

export const getRunConfigMetrics = async ({
  clusterId,
  configId,
}: {
  clusterId: string;
  configId: string;
}) => {
  return db
    .select({
      createdAt: workflows.created_at,
      count: countDistinct(workflows.id).as("count"),
      feedbackScore: workflows.feedback_score,
      jobCount: countDistinct(jobs.id).as("job_count"),
      jobFailureCount: sql<number>`COUNT(${jobs.id}) FILTER (WHERE ${jobs.status} = 'failure')`.as(
        "job_failure_count"
      ),
      timeToCompletion: sql<number>`
        EXTRACT(EPOCH FROM (
          MAX(${workflowMessages.created_at}) - MIN(${workflowMessages.created_at})
        ))
      `.as("time_to_completion"),
    })
    .from(workflows)
    .leftJoin(jobs, eq(workflows.id, jobs.workflow_id))
    .leftJoin(workflowMessages, eq(workflows.id, workflowMessages.workflow_id))
    .where(and(eq(workflows.cluster_id, clusterId), eq(workflows.config_id, configId)))
    .groupBy(workflows.id, workflows.created_at, workflows.feedback_score)
    .limit(1000);
};

export const createRetry = async ({
  clusterId,
  runId,
  messageId,
}: {
  clusterId: string;
  runId: string;
  messageId: string;
}) => {
  const { deleted } = await prepMessagesForRetry({
    clusterId,
    runId,
    messageId,
  });

  await db
    .update(workflows)
    .set({
      status: "pending",
      failure_reason: null,
    })
    .where(eq(workflows.id, runId));

  await resumeRun({
    clusterId,
    id: runId,
  });

  return {
    deleted,
  };
};

export const getRunCustomAuthToken = async ({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}) => {
  const [workflow] = await db
    .select({
      customAuthToken: workflows.custom_auth_token,
    })
    .from(workflows)
    .where(and(eq(workflows.id, runId), eq(workflows.cluster_id, clusterId)))
    .limit(1);

  if (!workflow) {
    throw new NotFoundError("Run not found");
  }

  return workflow.customAuthToken;
};
