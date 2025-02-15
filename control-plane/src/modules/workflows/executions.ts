import { z } from "zod";
import * as jobs from "../jobs/jobs";
import { packer } from "../packer";
import { getClusterBackgroundRun } from "../runs";
import { BadRequestError, NotFoundError } from "../../utilities/errors";
import * as data from "../data";
import { and, eq, sql } from "drizzle-orm";
import { getWorkflowTools } from "../tools";
import { logger } from "../observability/logger";
import { getEventsForJobId } from "../observability/events";

export const getWorkflowExecutionTimeline = async ({
  executionId,
  workflowName,
  clusterId,
}: {
  executionId: string;
  workflowName: string;
  clusterId: string;
}) => {
  const [execution] = await data.db
    .select({
      id: data.workflowExecutions.id,
      workflowName: data.workflowExecutions.workflow_name,
      workflowVersion: data.workflowExecutions.workflow_version,
      createdAt: data.workflowExecutions.created_at,
      updatedAt: data.workflowExecutions.updated_at,
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
      }
    })
    .from(data.workflowExecutions)
    .innerJoin(data.jobs, eq(data.workflowExecutions.job_id, data.jobs.id))
    .where(
      and(
        eq(data.workflowExecutions.workflow_name, workflowName),
        eq(data.workflowExecutions.cluster_id, clusterId),
        eq(data.workflowExecutions.id, executionId)
      )
    );

  if (!execution) {
    throw new NotFoundError(`Workflow execution ${executionId} not found`);
  }

  const runs = await getWorkflowRuns({
    workflowName,
    clusterId,
    executionId
  })

  const events = await getEventsForJobId({
    jobId: execution.job.id,
    clusterId
  })

  return {
    execution,
    runs,
    events,
  }
}


export const listWorkflowExecutions = async ({
  workflowName,
  clusterId
}: {
  workflowName: string;
  clusterId: string
  }) => {

  const executions = await data.db
    .select({
      id: data.workflowExecutions.id,
      workflowName: data.workflowExecutions.workflow_name,
      workflowVersion: data.workflowExecutions.workflow_version,
      jobId: data.workflowExecutions.job_id,
      createdAt: data.workflowExecutions.created_at,
      updatedAt: data.workflowExecutions.updated_at,
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

      }
    })
    .from(data.workflowExecutions)
    .innerJoin(data.jobs, eq(data.workflowExecutions.job_id, data.jobs.id))
    .where(
      and(
        eq(data.workflowExecutions.workflow_name, workflowName),
        eq(data.workflowExecutions.cluster_id, clusterId)
      )
    )

  return executions
}

export const createWorkflowExecution = async (
  clusterId: string,
  workflowName: string,
  input: unknown
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
      `No workflow registration for ${workflowName}. You might want to make the workflow listen first.`
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

  const job = await jobs.createJobV2({
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
      job_id: job.id,
      workflow_name: workflowName,
      workflow_version: version,
    })
    .onConflictDoNothing();

  return { jobId: job.id };
};

export const resumeWorkflowExecution = async ({
  clusterId,
  id,
}: {
  clusterId: string;
  id: string;
}) => {
  const existing = await data.db
    .select()
    .from(data.workflowExecutions)
    .where(
      and(
        eq(data.workflowExecutions.cluster_id, clusterId),
        eq(data.workflowExecutions.id, id)
      )
    );

  if (existing.length === 0) {
    throw new NotFoundError(`Workflow execution ${id} not found`);
  }

  const workflowExecution = existing[0];

  const existingJob = await jobs.getJob({
    clusterId,
    jobId: workflowExecution.job_id,
  });

  if (!existingJob) {
    throw new NotFoundError(
      `Job ${workflowExecution.job_id} not found while resuming workflow execution ${id}`
    );
  }

  if (existingJob.approvalRequested && !existingJob.approved) {
    logger.warn(
      "Workflow execution is not approved yet. Waiting for approval before resuming",
      {
        clusterId,
        workflowExecutionId: id,
      }
    )
  }

  // Move the job back to pending to allow it to be resumed
  const [job] = await data.db
    .update(data.jobs)
    .set({
      status: "pending",
      executing_machine_id: null,
      last_retrieved_at: null,
      remaining_attempts: sql`remaining_attempts + 1`,
    })
    .where(
      and(
        eq(data.jobs.id, workflowExecution.job_id),
        eq(data.jobs.cluster_id, clusterId),
      )
    )
    .returning({
      id: data.jobs.id,
    });

  return { jobId: job.id };
};

export const getWorkflowRuns = async ({ clusterId, executionId, workflowName }: { clusterId: string; executionId: string; workflowName: string }) => {
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
      modelIdentifier: data.runs.model_identifier,
    })
    .from(data.runs)
    .where(
      and(
        eq(data.runs.cluster_id, clusterId),
        eq(data.runs.workflow_execution_id, executionId),
        eq(data.runs.workflow_name, workflowName)
      )
    );

  return runs;
};
