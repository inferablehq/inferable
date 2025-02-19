import { and, eq, gt, isNotNull, lt, or, sql } from "drizzle-orm";
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
      targetFn: data.jobs.target_fn,
      clusterId: data.jobs.cluster_id,
      remainingAttempts: data.jobs.remaining_attempts,
      runId: data.jobs.run_id,
    });

  stalledByTimeout.forEach(row => {
    events.write({
      clusterId: row.clusterId,
      jobId: row.id,
      type: "jobStalled",
      runId: row.runId ?? undefined,
      meta: {
        attemptsRemaining: row.remainingAttempts ?? undefined,
        reason: "timeout",
      },
    });
  });

  // We have an infrequent issue with jobs not being resumed correctly from the "interupted" state.
  const nonResumedInterruptions = await data.db
    .update(data.jobs)
    .set({
      status: "stalled",
      // Don't subtrack this type of retry from the remaining attempts count
      remaining_attempts: sql`remaining_attempts + 1`
    })
    .where(
      and(
        eq(data.jobs.status, "interrupted"),
        gt(data.jobs.updated_at, sql`now() - interval '1 hour'`),
        lt(
          data.jobs.updated_at,
          // Find any jobs that have been interrupted for more than 5 minutes
          sql`now() - interval '5 minutes'`
        ),
        eq(data.jobs.approval_requested, false),
      )
    )
    .returning({
      id: data.jobs.id,
      targetFn: data.jobs.target_fn,
      clusterId: data.jobs.cluster_id,
    });

  if (nonResumedInterruptions.length > 0) {
    logger.warn("Found interrupted jobs that have not been resumed", {
      count: nonResumedInterruptions.length,
      jobs: nonResumedInterruptions.map(row => row.id).join(", ")
    });
  };

  const stalledJobs = await data.db
    .update(data.jobs)
    .set({
      status: sql`CASE
        WHEN remaining_attempts > 0 THEN 'pending'
        ELSE 'failure'
      END`,
      remaining_attempts: sql`CASE
        WHEN remaining_attempts > 0 THEN remaining_attempts - 1
        ELSE remaining_attempts
      END`,
    })
    .where(eq(data.jobs.status, "stalled"))
    .returning({
      id: data.jobs.id,
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
        clusterId: row.clusterId,
        jobId: row.id,
        type: "jobRecovered",
      });
    } else {
      events.write({
        clusterId: row.clusterId,
        jobId: row.id,
        type: "jobStalledTooManyTimes",
      });

      if (row.runId) {
        resumeRun({ id: row.runId, clusterId: row.clusterId });
      }
    }
  });

  return {
    stalledFailedByTimeout: stalledByTimeout.map(row => row.id),
    stalledRecovered: stalledJobs.filter(row => row.status === "pending").map(row => row.id),
    nonResumedInterruptions: nonResumedInterruptions.map(row => row.id),
  };
}
