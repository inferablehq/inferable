import {
  InferSelectModel,
  and,
  countDistinct,
  desc,
  eq,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { ulid } from "ulid";
import {
  BadRequestError,
  NotFoundError,
  RunBusyError,
} from "../../utilities/errors";
import { logger } from "../observability/logger";
import { Auth } from "../auth/auth";
import {
  clusters,
  db,
  jobs,
  RunMessageMetadata,
  workflowMessages,
  workflowMetadata,
  workflows,
} from "../data";
import {
  getWorkflowMessages,
  hasInvocations,
  lastAgentMessage,
  prepMessagesForRetry,
  upsertRunMessage,
} from "./workflow-messages";
import { env } from "../../utilities/env";
import { injectTraceContext } from "../observability/tracer";
import { getWorkflowMetadata } from "./metadata";
import { sqs } from "../sqs";
import { ChatIdentifiers } from "../models/routing";
import { customerTelemetry } from "../customer-telemetry";

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
};

export const createRun = async ({
  user,
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
  customerAuthToken,
  authContext,
  context,
}: {
  user?: Auth;
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
  customerAuthToken?: string;
  authContext?: unknown;
  context?: unknown;
}): Promise<Run> => {
  let run: Run | undefined = undefined;

  await db.transaction(async (tx) => {
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
          id: ulid(),
          cluster_id: clusterId,
          status: "pending",
          user_id: user?.entityId ?? "SYSTEM",
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
          customer_auth_token: customerAuthToken,
          auth_context: authContext,
          context: context,
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
      });

    run = result[0];

    if (!!run && metadata) {
      await tx.insert(workflowMetadata).values(
        Object.entries(metadata).map(([key, value]) => ({
          cluster_id: clusterId,
          workflow_id: run!.id,
          key,
          value,
        })),
      );
    }
  });

  if (!run) {
    throw new Error("Failed to create run");
  }

  return run;
};

export const deleteRun = async ({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}) => {
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
    .where(
      and(
        eq(workflows.cluster_id, workflow.clusterId),
        eq(workflows.id, workflow.id),
      ),
    )
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
    customerTelemetry.track({
      type: "runFeedback",
      runId: workflow.id,
      clusterId: workflow.clusterId,
      score: workflow.feedbackScore,
      comment: workflow.feedbackComment || undefined,
    });
  }

  return updated;
};

export const getWorkflow = async ({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}) => {
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
    })
    .from(workflows)
    .where(
      and(
        eq(workflows.cluster_id, clusterId),
        eq(workflows.test, test),
        ...(userId ? [eq(workflows.user_id, userId)] : []),
        ...(configId ? [eq(workflows.config_id, configId)] : []),
      ),
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
      })
      .from(workflows)
      .where(and(eq(workflows.cluster_id, clusterId), eq(workflows.id, runId))),
    lastAgentMessage({ clusterId, runId }),
    getWorkflowMetadata({ clusterId, runId }),
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
  user,
  id,
  clusterId,
  runId,
  message,
  type,
  metadata,
  skipAssert,
}: {
  user?: Auth;
  id: string;
  clusterId: string;
  runId: string;
  message: string;
  type: "human" | "template" | "supervisor";
  metadata?: RunMessageMetadata;
  skipAssert?: boolean;
}) => {
  if (!skipAssert) await assertRunReady({ clusterId, runId });
  await upsertRunMessage({
    user,
    clusterId,
    runId,
    data: {
      message,
    },
    type,
    id,
    metadata,
  });

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

export const createRunWithMessage = async ({
  user,
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
  customerAuthToken,
  authContext,
  context,
}: {
  user?: Auth;
  clusterId: string;
  message: string;
  systemPrompt?: string;
  type: "human" | "template";
  name?: string;
  test?: boolean;
  testMocks?: Record<
    string,
    {
      output: Record<string, unknown>;
    }
  >;
  messageMetadata?: RunMessageMetadata;
  onStatusChange?: string;
  resultSchema?: unknown;
  metadata?: Record<string, string>;
  attachedFunctions?: string[];
  configId?: string;
  configVersion?: number;
  reasoningTraces?: boolean;
  interactive?: boolean;
  enableSummarization?: boolean;
  modelIdentifier?: ChatIdentifiers;
  customerAuthToken?: string;
  authContext?: unknown;
  context?: unknown;
}) => {
  const workflow = await createRun({
    user,
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
    customerAuthToken,
    authContext,
    context,
  });

  await addMessageAndResume({
    id: ulid(),
    user,
    clusterId,
    runId: workflow.id,
    message,
    type,
    metadata: messageMetadata,
    skipAssert: true,
  });

  await generateRunName(workflow, message);

  return workflow;
};

export const assertRunReady = async (input: {
  runId: string;
  clusterId: string;
}) => {
  const run = await getWorkflow(input);
  if (!run) {
    throw new NotFoundError("Run not found");
  }

  logger.info("Asserting run is ready", {
    runId: run.id,
    status: run.status,
  });

  if (!run.interactive) {
    throw new BadRequestError(
      "Run is not interactive and cannot accept new messages.",
    );
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

  throw new RunBusyError(
    "Run is not ready for new messages: Unprocessed messages",
  );
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
          and(eq(jobs.approval_requested, true), ne(jobs.approved, true)),
        ),
      ),
    );

  return waitingJobs.map((job) => job.id);
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
      jobFailureCount:
        sql<number>`COUNT(${jobs.id}) FILTER (WHERE ${jobs.status} = 'failure')`.as(
          "job_failure_count",
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
    .where(
      and(
        eq(workflows.cluster_id, clusterId),
        eq(workflows.config_id, configId),
      ),
    )
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

export const getRunCustomerAuthToken = async ({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}) => {
  const [workflow] = await db
    .select({
      customerAuthToken: workflows.customer_auth_token,
    })
    .from(workflows)
    .where(and(eq(workflows.id, runId), eq(workflows.cluster_id, clusterId)))
    .limit(1);

  if (!workflow) {
    throw new NotFoundError("Run not found");
  }

  return workflow.customerAuthToken;
};
