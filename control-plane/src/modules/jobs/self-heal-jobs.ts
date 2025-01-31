import { and, eq, gte, isNotNull, lt, or, sql } from "drizzle-orm";
import * as data from "../data";
import * as events from "../observability/events";
import { logger } from "../observability/logger";
import { resumeRun } from "../runs";

export async function selfHealJobs() {
  logger.debug("Running Job Self-healing");

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
      runId: data.jobs.run_id,
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

  const stalledJobs = await data.db
    .update(data.jobs)
    .set({
      status: "pending",
      remaining_attempts: sql`remaining_attempts - 1`,
    })
    .where(and(eq(data.jobs.status, "stalled"), gte(data.jobs.remaining_attempts, 1)))
    .returning({
      id: data.jobs.id,
      service: data.jobs.service,
      targetFn: data.jobs.target_fn,
      targetArgs: data.jobs.target_args,
      clusterId: data.jobs.cluster_id,
      remainingAttempts: data.jobs.remaining_attempts,
      status: data.jobs.status,
      runId: data.jobs.run_id,
    });

  stalledJobs.forEach(row => {
    if (row.status === "pending") {
      events.write({
        service: row.service,
        clusterId: row.clusterId,
        jobId: row.id,
        type: "jobRecovered",
      });
    }
  });

  return {
    stalledFailedByTimeout: stalledByTimeout.map(row => row.id),
    stalledRecovered: stalledJobs.filter(row => row.status === "pending").map(row => row.id),
  };
}
