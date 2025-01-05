import { and, eq, isNull, sql } from "drizzle-orm";
import * as data from "../data";
import * as events from "../observability/events";
import { logger } from "../observability/logger";
import { resumeRun } from "../runs";

type PersistResultParams = {
  result: string;
  resultType: "resolution" | "rejection" | "interrupt";
  functionExecutionTime?: number;
  jobId: string;
  owner: { clusterId: string };
  machineId: string;
};

export async function acknowledgeJob({
  jobId,
  clusterId,
  machineId,
}: {
  jobId: string;
  clusterId: string;
  machineId: string;
}) {
  const [job] = await data.db
    .update(data.jobs)
    .set({
      status: "running",
      last_retrieved_at: sql`now()`,
      executing_machine_id: machineId,
      remaining_attempts: sql`remaining_attempts - 1`,
    })
    .where(
      and(
        eq(data.jobs.id, jobId),
        eq(data.jobs.cluster_id, clusterId),
        eq(data.jobs.status, "pending")
      )
    )
    .returning({
      service: data.jobs.service,
      targetFn: data.jobs.target_fn,
      targetArgs: data.jobs.target_args,
    });

  if (!job) {
    throw new Error(`Failed to acknowledge job ${jobId}`);
  }

  events.write({
    type: "jobAcknowledged",
    jobId,
    clusterId: clusterId,
    service: job.service,
    machineId,
    targetFn: job.targetFn,
    meta: {
      targetArgs: job.targetArgs,
    },
  });

  return job;
}

export async function persistJobResult({
  result,
  resultType,
  functionExecutionTime,
  jobId,
  owner,
  machineId,
}: PersistResultParams) {
  const updateResult = await data.db
    .update(data.jobs)
    .set({
      result,
      result_type: resultType,
      resulted_at: sql`now()`,
      function_execution_time_ms: functionExecutionTime || null,
      status: "success",
    })
    .where(
      and(
        eq(data.jobs.id, jobId),
        eq(data.jobs.cluster_id, owner.clusterId),
        eq(data.jobs.executing_machine_id, machineId),
        eq(data.jobs.status, "running"),
        isNull(data.jobs.resulted_at)
      )
    )
    .returning({
      service: data.jobs.service,
      targetFn: data.jobs.target_fn,
      runId: data.jobs.workflow_id,
    });

  if (updateResult.length === 0) {
    logger.warn("Job result was not persisted", {
      jobId,
    });
    events.write({
      type: "functionResultedButNotPersisted",
      service: updateResult[0]?.service,
      clusterId: owner.clusterId,
      jobId,
      machineId,
      targetFn: updateResult[0]?.targetFn,
      resultType,
      workflowId: updateResult[0]?.runId ?? undefined,
      meta: {
        functionExecutionTime,
      },
    });
  } else {
    if (updateResult[0].runId) {
      await resumeRun({
        id: updateResult[0].runId,
        clusterId: owner.clusterId,
      });
    }

    events.write({
      type: "functionResulted",
      service: updateResult[0]?.service,
      clusterId: owner.clusterId,
      jobId,
      machineId,
      targetFn: updateResult[0]?.targetFn,
      resultType,
      workflowId: updateResult[0]?.runId ?? undefined,
      meta: {
        functionExecutionTime,
      },
    });
  }

  return updateResult.length;
}
