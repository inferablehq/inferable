import { z } from "zod";
import * as jobs from "../jobs/jobs";
import { packer } from "../packer";
import { getClusterBackgroundRun } from "../runs";
import { getWorkflowServices } from "../service-definitions";
import { BadRequestError, NotFoundError } from "../../utilities/errors";
import { db, workflowExecutions } from "../data";
import { and, eq } from "drizzle-orm";

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
    throw new Error("Invalid input");
  }

  const services = await getWorkflowServices({ clusterId, workflowName });

  if (services.length === 0) {
    throw new BadRequestError(
      `No workflow registration for ${workflowName}. You might want to make the workflow listen first.`
    );
  }

  const latestService = services.reduce((latest, service) => {
    if (service.version > latest.version) {
      return service;
    }

    return latest;
  }, services[0]);

  const job = await jobs.createJob({
    owner: { clusterId },
    service: latestService.service,
    targetFn: "handler",
    targetArgs: packer.pack(parsed.data),
    runId: getClusterBackgroundRun(clusterId), // we don't really care about the run semantics here, only that it's a job that gets picked up by the worker at least once
  });

  await db
    .insert(workflowExecutions)
    .values({
      id: parsed.data.executionId,
      cluster_id: clusterId,
      workflow_execution_id: parsed.data.executionId,
      job_id: job.id,
      workflow_name: workflowName,
      version: latestService.version,
    })
    .onConflictDoNothing();

  return { jobId: job.id };
};

export const resumeWorkflowExecution = async ({
  clusterId,
  workflowExecutionId,
}: {
  clusterId: string;
  workflowExecutionId: string;
}) => {
  const existing = await db
    .select()
    .from(workflowExecutions)
    .where(
      and(
        eq(workflowExecutions.cluster_id, clusterId),
        eq(workflowExecutions.workflow_execution_id, workflowExecutionId)
      )
    );

  if (existing.length === 0) {
    throw new NotFoundError(`Workflow execution ${workflowExecutionId} not found`);
  }

  const workflowExecution = existing[0];

  const existingJob = await jobs.getJob({
    clusterId,
    jobId: workflowExecution.job_id,
  });

  if (!existingJob) {
    throw new NotFoundError(
      `Job ${workflowExecution.job_id} not found while resuming workflow execution ${workflowExecutionId}`
    );
  }

  // create a new job for the workflow execution
  // and feed in the existing job's args
  const job = await jobs.createJob({
    owner: {
      clusterId,
    },
    service: existingJob.service,
    targetFn: existingJob.targetFn,
    targetArgs: existingJob.targetArgs,
    runId: existingJob.runId,
  });

  return { jobId: job.id };
};
