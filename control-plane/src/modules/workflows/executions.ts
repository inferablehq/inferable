import { z } from "zod";
import * as jobs from "../jobs/jobs";
import { packer } from "../../utilities/packer";
import { getClusterBackgroundRun } from "../runs";
import { BadRequestError, NotFoundError } from "../../utilities/errors";
import * as data from "../data";
import { and, desc, eq, sql, isNotNull, or } from "drizzle-orm";
import { getWorkflowTools } from "../tools";
import { logger } from "../observability/logger";
import { getEventsForJobId } from "../observability/events";
import { kv } from "../kv";
import * as cron from "../cron";

export const cleanupMarkedWorkflowExecutions = async () => {
  const executions = await data.db
    .select({
      id: data.workflowExecutions.id,
      clusterId: data.workflowExecutions.cluster_id,
      jobId: data.workflowExecutions.job_id,
    })
    .from(data.workflowExecutions)
    .limit(100)
    .where(
      and(
        isNotNull(data.workflowExecutions.deleted_at),
        // Cleaned up executions will no longer have a job
        isNotNull(data.workflowExecutions.job_id),
      ),
    );

  logger.info("Deleting marked workflow executions", {
    count: executions.length,
    executionIds: executions.map(execution => execution.id),
  });

  for (const execution of executions) {
    try {
      await data.db.transaction(async tx => {
        // Mark Run as deleted
        await tx
          .update(data.runs)
          .set({ deleted_at: new Date() })
          .where(
            and(
              eq(data.runs.workflow_execution_id, execution.id),
              eq(data.runs.cluster_id, execution.clusterId),
            ),
          );

        // Mark Events as deleted
        await tx
          .update(data.events)
          .set({ deleted_at: new Date() })
          .where(
            and(
              eq(data.events.job_id, execution.jobId),
              eq(data.events.cluster_id, execution.clusterId),
            ),
          );

        // Cleanup any KV values
        await tx
          .delete(data.clusterKV)
          .where(
            and(
              eq(data.clusterKV.cluster_id, execution.clusterId),
              sql`${data.clusterKV.key} LIKE ${`${execution.id}_%`}`,
            ),
          );

        // Remove all data from job
        await tx
          .update(data.jobs)
          .set({
            result: null,
            target_args: "",
          })
          .where(
            and(
              eq(data.jobs.id, execution.jobId),
              eq(data.jobs.cluster_id, execution.clusterId),
            ),
          );
      });
    } catch (error) {
      logger.error("Error deleting workflow execution", {
        executionId: execution.id,
        clusterId: execution.clusterId,
        error: error,
      });
    }
  }
};

export const getWorkflowExecutionTimeline = async ({
  executionId,
  workflowName,
  clusterId,
}: {
  executionId: string;
  workflowName: string;
  clusterId: string;
}) => {
  const [[execution], runs, events, memos, structured] = await Promise.all([
    data.db
      .select({
        id: data.workflowExecutions.id,
        workflowName: data.workflowExecutions.workflow_name,
        workflowVersion: data.workflowExecutions.workflow_version,
        createdAt: data.workflowExecutions.created_at,
        updatedAt: data.workflowExecutions.updated_at,
        deletedAt: data.workflowExecutions.deleted_at,
        job: {
          id: data.jobs.id,
          clusterId: data.jobs.cluster_id,
          status: data.jobs.status,
          targetFn: data.jobs.target_fn,
          executingMachineId: data.jobs.executing_machine_id,
          targetArgs: data.jobs.target_args,
          result: data.jobs.result,
          resultType: data.jobs.result_type,
          createdAt: data.jobs.created_at,
          runId: data.jobs.run_id,
          runContext: data.jobs.run_context,
          authContext: data.jobs.auth_context,
          approvalRequested: data.jobs.approval_requested,
          approved: data.jobs.approved,
        },
      })
      .from(data.workflowExecutions)
      .innerJoin(data.jobs, eq(data.workflowExecutions.job_id, data.jobs.id))
      .where(
        and(
          eq(data.workflowExecutions.workflow_name, workflowName),
          eq(data.workflowExecutions.cluster_id, clusterId),
          eq(data.workflowExecutions.id, executionId),
        ),
      ),
    getWorkflowRuns({ clusterId, executionId, workflowName }),
    getEventsForJobId({ jobId: executionId, clusterId }),
    kv.getAllByPrefix(clusterId, `${executionId}_memo_`),
    kv.getAllByPrefix(clusterId, `${executionId}_structured_`),
  ]);

  return {
    execution,
    runs,
    events,
    memos,
    structured,
  };
};

export const listWorkflowExecutions = async ({
  clusterId,
  filters,
  limit = 50,
}: {
  clusterId: string;
  filters?: {
    workflowName?: string;
    workflowVersion?: string;
    workflowExecutionId?: string;
    workflowExecutionStatus?: string;
  };
  limit?: number;
}) => {
  const status = z
    .enum([
      "pending",
      "running",
      "success",
      "failure",
      "stalled",
      "interrupted",
    ])
    .optional()
    .parse(filters?.workflowExecutionStatus);

  const executions = await data.db
    .select({
      id: data.workflowExecutions.id,
      workflowName: data.workflowExecutions.workflow_name,
      workflowVersion: data.workflowExecutions.workflow_version,
      jobId: data.workflowExecutions.job_id,
      createdAt: data.workflowExecutions.created_at,
      updatedAt: data.workflowExecutions.updated_at,
      deletedAt: data.workflowExecutions.deleted_at,
      jobsId: data.jobs.id,
      jobsStatus: data.jobs.status,
      jobsTargetFn: data.jobs.target_fn,
      jobsExecutingMachineId: data.jobs.executing_machine_id,
      jobsTargetArgs: data.jobs.target_args,
      jobsResult: data.jobs.result,
      jobsResultType: data.jobs.result_type,
      jobsCreatedAt: data.jobs.created_at,
      jobsApprovalRequested: data.jobs.approval_requested,
      jobsApproved: data.jobs.approved,
      runsId: data.runs.id,
      runsName: data.runs.name,
      runsCreatedAt: data.runs.created_at,
      runsStatus: data.runs.status,
      runsFailureReason: data.runs.failure_reason,
      runsType: data.runs.type,
      runsModelIdentifier: data.runs.model_identifier,
    })
    .from(data.workflowExecutions)
    .leftJoin(data.jobs, eq(data.workflowExecutions.job_id, data.jobs.id))
    .leftJoin(
      data.runs,
      eq(data.workflowExecutions.id, data.runs.workflow_execution_id),
    )
    .where(
      and(
        filters?.workflowName
          ? eq(data.workflowExecutions.workflow_name, filters.workflowName)
          : undefined,
        filters?.workflowVersion
          ? eq(
              data.workflowExecutions.workflow_version,
              Number(filters.workflowVersion),
            )
          : undefined,
        filters?.workflowExecutionId
          ? eq(data.workflowExecutions.id, filters.workflowExecutionId)
          : undefined,
        status ? eq(data.jobs.status, status) : undefined,
        eq(data.workflowExecutions.cluster_id, clusterId),
      ),
    )
    .limit(limit)
    .orderBy(desc(data.workflowExecutions.created_at));

  const uniqueExecutionIds = executions
    .map(execution => execution.id)
    .reduce((acc, id) => {
      if (acc.includes(id)) {
        return acc;
      }

      return [...acc, id];
    }, [] as string[]);

  return uniqueExecutionIds.map(executionId => {
    const related = executions.filter(
      execution => execution.id === executionId,
    );

    const job = related.find(r => r.jobId);

    const runs = related.filter(r => r.runsId);

    return {
      execution: related[0],
      job: {
        id: job?.jobId ?? "",
        status: job?.jobsStatus ?? null,
        targetFn: job?.jobsTargetFn ?? null,
        executingMachineId: job?.jobsExecutingMachineId,
        targetArgs: job?.jobsTargetArgs ?? null,
        result: job?.jobsResult ?? null,
        resultType: job?.jobsResultType ?? null,
        createdAt: job?.jobsCreatedAt ?? new Date(),
        approved: job?.jobsApproved,
        approvalRequested: job?.jobsApprovalRequested,
      },
      runs: runs.map(r => ({
        id: r.runsId!,
        name: r.runsName!,
        createdAt: r.runsCreatedAt!,
        status: r.runsStatus,
        failureReason: r.runsFailureReason,
        type: r.runsType || "multi-step",
      })),
    };
  });
};

export const createWorkflowExecution = async (
  clusterId: string,
  workflowName: string,
  input: unknown,
) => {
  const parsed = z
    .object({
      executionId: z.string(),
    })
    .passthrough()
    .safeParse(input);

  if (!parsed.success) {
    throw new Error("Workflow excution input does not contain 'executionId'");
  }

  const tools = await getWorkflowTools({ clusterId, workflowName });

  if (tools.length === 0) {
    throw new BadRequestError(
      `No workflow registration for ${workflowName}. You might want to make the workflow listen first.`,
    );
  }

  const latest = tools.reduce((latest, tool) => {
    if (tool.version > latest.version) {
      return tool;
    }

    return latest;
  }, tools[0]);

  const version = latest.version;

  logger.info(`Using workflow tool ${latest.name} for ${workflowName}`);

  const jobId = parsed.data.executionId;

  await jobs.createJobV2({
    /**
     * The job created for the workflow execution has the same jobId as the executionId.
     * This prevents us from doing a lookup by jobId to find the executionId.
     */
    jobId,
    owner: { clusterId },
    targetFn: latest.toolName,
    targetArgs: packer.pack(parsed.data),
    runId: getClusterBackgroundRun(clusterId), // we don't really care about the run semantics here, only that it's a job that gets picked up by the worker at least once
  });

  await data.db
    .insert(data.workflowExecutions)
    .values({
      id: parsed.data.executionId,
      cluster_id: clusterId,
      job_id: jobId,
      workflow_name: workflowName,
      workflow_version: version,
    })
    .onConflictDoNothing();

  return { jobId };
};

export const resumeWorkflowExecution = async ({
  clusterId,
  id,
}: {
  clusterId: string;
  id: string;
}) => {
  const [existing] = await data.db
    .select()
    .from(data.workflowExecutions)
    .innerJoin(
      data.jobs,
      and(
        eq(data.workflowExecutions.job_id, data.jobs.id),
        eq(data.workflowExecutions.cluster_id, data.jobs.cluster_id),
      ),
    )
    .where(
      and(
        eq(data.workflowExecutions.cluster_id, clusterId),
        eq(data.workflowExecutions.id, id),
      ),
    );

  const execution = existing?.workflow_executions;
  const job = existing?.jobs;

  if (!execution) {
    throw new NotFoundError(`Workflow execution ${id} not found`);
  }

  if (!job) {
    throw new NotFoundError(
      `Job not found while resuming workflow execution ${id}`,
    );
  }

  if (job.approval_requested && !job.approved) {
    logger.warn(
      "Workflow execution is not approved yet. Waiting for approval before resuming",
      {
        clusterId,
        workflowExecutionId: id,
      },
    );
  }

  // Move the job back to pending to allow it to be resumed
  const [updated] = await data.db
    .update(data.jobs)
    .set({
      status: "pending",
      executing_machine_id: null,
      last_retrieved_at: null,
      remaining_attempts: sql`remaining_attempts + 1`,
    })
    .where(
      and(
        eq(data.jobs.id, job.id),
        eq(data.jobs.cluster_id, clusterId),
        eq(data.jobs.status, "interrupted"),
      ),
    )
    .returning({
      id: data.jobs.id,
    });

  return { jobId: updated?.id };
};

export const getWorkflowRuns = async ({
  clusterId,
  executionId,
  workflowName,
}: {
  clusterId: string;
  executionId: string;
  workflowName: string;
}) => {
  const runs = await data.db
    .select({
      id: data.runs.id,
      name: data.runs.name,
      createdAt: data.runs.created_at,
      userId: data.runs.user_id,
      clusterId: data.runs.cluster_id,
      status: data.runs.status,
      failureReason: data.runs.failure_reason,
      type: data.runs.type,
    })
    .from(data.runs)
    .where(
      and(
        eq(data.runs.cluster_id, clusterId),
        eq(data.runs.workflow_execution_id, executionId),
        eq(data.runs.workflow_name, workflowName),
      ),
    );

  return runs;
};

export const start = async () => {
  await cron.registerCron(
    cleanupMarkedWorkflowExecutions,
    "cleanup-marked-workflow-executions",
    {
      interval: 1000 * 60 * 15,
    },
  ); // 15 minutes
};
