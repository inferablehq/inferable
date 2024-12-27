import { and, eq, gt, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import * as data from "../data";
import * as events from "../observability/events";
import { logger } from "../observability/logger";
import { upsertResultKeys } from "../tool-metadata";
import { resumeRun } from "../workflows/workflows";

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

export async function selfHealJobs(params?: { machineStallTimeout?: number }) {
  // TODO: these queries need to be chunked. If there are 100k jobs, we don't want to update them all at once

  logger.debug("Running Self-healing job");

  // Jobs are failed if they are running and have timed out
  const stalledByTimeout = await data.db
    .update(data.jobs)
    .set({
      status: "stalled",
    })
    .where(
      and(
        eq(data.jobs.status, "running"),
        lt(
          data.jobs.last_retrieved_at,
          sql`now() - interval '1 second' * timeout_interval_seconds`
        ),
        // only timeout jobs that have a timeout set
        isNotNull(data.jobs.timeout_interval_seconds),
        // Don't time out jobs that have pending approval requests
        or(eq(data.jobs.approval_requested, false), isNotNull(data.jobs.approved))
      )
    )
    .returning({
      id: data.jobs.id,
      service: data.jobs.service,
      targetFn: data.jobs.target_fn,
      clusterId: data.jobs.cluster_id,
      remainingAttempts: data.jobs.remaining_attempts,
      runId: data.jobs.workflow_id,
    });

  const stalledMachines = await data.db
    .update(data.machines)
    .set({
      status: "inactive",
    })
    .where(
      and(
        lt(
          data.machines.last_ping_at,
          sql`now() - interval '1 second' * ${params?.machineStallTimeout ?? 90}`
        ),
        eq(data.machines.status, "active")
      )
    )
    .returning({
      id: data.machines.id,
      clusterId: data.machines.cluster_id,
    });

  // mark jobs with stalled machines as failed
  const stalledByMachine = await data.db.execute<{
    id: string;
    service: string;
    target_fn: string;
    cluster_id: string;
    remaining_attempts: number;
    runId: string | undefined;
  }>(
    sql`
      UPDATE jobs as j
      SET status = 'stalled'
      FROM machines as m
      WHERE
        j.status = 'running' AND
        j.executing_machine_id = m.id AND
        m.status = 'inactive' AND
        j.cluster_id = m.cluster_id AND
        j.remaining_attempts > 0
    `
  );

  const stalledRecoveredJobs = await data.db
    .update(data.jobs)
    .set({
      status: "pending",
      remaining_attempts: sql`remaining_attempts - 1`,
    })
    .where(and(eq(data.jobs.status, "stalled"), gt(data.jobs.remaining_attempts, 0)))
    .returning({
      id: data.jobs.id,
      service: data.jobs.service,
      targetFn: data.jobs.target_fn,
      targetArgs: data.jobs.target_args,
      clusterId: data.jobs.cluster_id,
      remainingAttempts: data.jobs.remaining_attempts,
    });

  const stalledFailedJobs = await data.db
    .update(data.jobs)
    .set({
      status: "failure",
    })
    .where(and(eq(data.jobs.status, "stalled"), lte(data.jobs.remaining_attempts, 0)))
    .returning({
      id: data.jobs.id,
      service: data.jobs.service,
      targetFn: data.jobs.target_fn,
      clusterId: data.jobs.cluster_id,
      remainingAttempts: data.jobs.remaining_attempts,
      runId: data.jobs.workflow_id,
    });

  stalledByTimeout.forEach(row => {
    events.write({
      service: row.service,
      clusterId: row.clusterId,
      jobId: row.id,
      type: "jobStalled",
      workflowId: row.runId ?? undefined,
      meta: {
        attemptsRemaining: row.remainingAttempts ?? undefined,
        reason: "timeout",
      },
    });
  });

  stalledByMachine.rows.forEach(row => {
    events.write({
      service: row.service,
      clusterId: row.cluster_id,
      jobId: row.id,
      type: "jobStalled",
      workflowId: row.runId ?? undefined,
      meta: {
        attemptsRemaining: row.remaining_attempts ?? undefined,
        reason: "machine stalled",
      },
    });
  });

  stalledMachines.forEach(row => {
    events.write({
      type: "machineStalled",
      clusterId: row.clusterId,
      machineId: row.id,
    });
  });

  stalledRecoveredJobs.forEach(async row => {
    events.write({
      service: row.service,
      clusterId: row.clusterId,
      jobId: row.id,
      type: "jobRecovered",
    });
  });

  stalledFailedJobs.forEach(row => {
    events.write({
      service: row.service,
      clusterId: row.clusterId,
      jobId: row.id,
      type: "jobStalledTooManyTimes",
    });

    if (row.runId) {
      resumeRun({ id: row.runId, clusterId: row.clusterId });
    }
  });

  return {
    stalledFailedByTimeout: stalledByTimeout.map(row => row.id),
    stalledRecovered: stalledRecoveredJobs.map(row => row.id),
    stalledMachines: stalledMachines.map(row => ({
      id: row.id,
      clusterId: row.clusterId,
    })),
    stalledFailedByMachine: stalledByMachine.rows.map(row => row.id),
  };
}
