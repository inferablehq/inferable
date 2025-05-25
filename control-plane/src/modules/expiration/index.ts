import { logger } from "../observability/logger";
import { registerCron } from "../cron";
import { db, clusters, events, runs, workflowExecutions, jobs } from "../data";
import { isNotNull, sql, and, isNull, lt, eq } from "drizzle-orm";

// Define the interval for the cron jobs (e.g., daily)
const CRON_INTERVAL = 15 * 60 * 1000; // 15 minutes

export const expireEvents = async () => {
  logger.info("Running expireEvents cron job");
  try {
    const clustersWithExpiry = await db
      .select({ id: clusters.id, expiryAge: clusters.event_expiry_age })
      .from(clusters)
      .where(isNotNull(clusters.event_expiry_age));

    for (const cluster of clustersWithExpiry) {
      if (cluster.expiryAge === null) continue;

      const expiryDate = sql`now() - interval '${sql.raw(cluster.expiryAge.toString())} second'`;

      await db
        .update(events)
        .set({ deleted_at: sql`now()` })
        .where(
          and(
            eq(events.cluster_id, cluster.id),
            isNull(events.deleted_at),
            lt(events.created_at, expiryDate),
          ),
        );
      logger.info(`Marked events for deletion in cluster`, {
        clusterId: cluster.id,
      });
    }
  } catch (error) {
    logger.error("Error in expireEvents cron job", { error });
  }
};

export const expireRuns = async () => {
  logger.info("Running expireRuns cron job");
  try {
    const clustersWithExpiry = await db
      .select({
        id: clusters.id,
        expiryAge: clusters.workflow_execution_expiry_age,
      })
      .from(clusters)
      .where(isNotNull(clusters.workflow_execution_expiry_age));

    for (const cluster of clustersWithExpiry) {
      if (cluster.expiryAge === null) continue;

      const expiryDate = sql`now() - interval '${sql.raw(cluster.expiryAge.toString())} second'`;

      await db
        .update(runs)
        .set({ deleted_at: sql`now()` })
        .where(
          and(
            eq(runs.cluster_id, cluster.id),
            isNull(runs.deleted_at),
            lt(runs.created_at, expiryDate),
          ),
        );
      logger.info(`Marked runs for deletion in cluster`, {
        clusterId: cluster.id,
      });
    }
  } catch (error) {
    logger.error("Error in expireRuns cron job", { error });
  }
};

export const expireWorkflowExecutions = async () => {
  logger.info("Running expireWorkflowExecutions cron job");
  try {
    const clustersWithExpiry = await db
      .select({
        id: clusters.id,
        expiryAge: clusters.workflow_execution_expiry_age,
      })
      .from(clusters)
      .where(isNotNull(clusters.workflow_execution_expiry_age));

    for (const cluster of clustersWithExpiry) {
      if (cluster.expiryAge === null) continue;

      const expiryDate = sql`now() - interval '${sql.raw(cluster.expiryAge.toString())} second'`;

      await db
        .update(workflowExecutions)
        .set({ deleted_at: sql`now()` })
        .where(
          and(
            eq(workflowExecutions.cluster_id, cluster.id),
            isNull(workflowExecutions.deleted_at),
            lt(workflowExecutions.created_at, expiryDate),
          ),
        );
      logger.info(`Marked workflow executions for deletion in cluster`, {
        clusterId: cluster.id,
      });
    }
  } catch (error) {
    logger.error("Error in expireWorkflowExecutions cron job", { error });
  }
};

export const expireJobs = async () => {
  logger.info("Running expireJobs cron job");
  try {
    const clustersWithExpiry = await db
      .select({
        id: clusters.id,
        expiryAge: clusters.workflow_execution_expiry_age,
      })
      .from(clusters)
      .where(isNotNull(clusters.workflow_execution_expiry_age));

    for (const cluster of clustersWithExpiry) {
      if (cluster.expiryAge === null) continue;
      const expiryDate = sql`now() - interval '${sql.raw(cluster.expiryAge.toString())} second'`;

      await db
        .update(jobs)
        .set({ deleted_at: sql`now()` })
        .where(
          and(
            eq(jobs.cluster_id, cluster.id),
            isNull(jobs.deleted_at),
            lt(jobs.created_at, expiryDate),
          ),
        );

      logger.info(`Marked jobs for deletion in cluster`, {
        clusterId: cluster.id,
      });
    }
  } catch (error) {
    logger.error("Error in expireJobs cron job", { error });
  }
};

/**
 * Starts the expiration cron jobs.
 */
export const start = async () => {
  logger.info("Starting expiration cron jobs");

  await registerCron(expireEvents, "expire-events", {
    interval: CRON_INTERVAL,
  });

  await registerCron(expireRuns, "expire-runs", { interval: CRON_INTERVAL });

  await registerCron(expireWorkflowExecutions, "expire-workflow-executions", {
    interval: CRON_INTERVAL,
  });

  await registerCron(expireJobs, "expire-jobs", {
    interval: CRON_INTERVAL,
  });
};
