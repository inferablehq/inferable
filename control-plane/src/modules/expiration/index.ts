import { logger } from "../observability/logger";
import { registerCron } from "../cron";
import { db, clusters } from "../data";
import { isNotNull } from "drizzle-orm";

// Define the interval for the cron jobs (e.g., daily)
const CRON_INTERVAL = 15 * 60 * 1000; // 15 minutes

/**
 * Cron job to find clusters with event expiry age set and log them.
 */
const expireEvents = async () => {
  logger.info("Running expireEvents cron job");
  try {
    const clustersWithExpiry = await db
      .select({ id: clusters.id })
      .from(clusters)
      .where(isNotNull(clusters.event_expiry_age));

    if (clustersWithExpiry.length > 0) {
      logger.info(
        `Found clusters with event expiry age set: ${clustersWithExpiry.map(c => c.id).join(", ")}`,
      );
      // TODO: Implement actual event expiration logic here
    } else {
      logger.info("No clusters found with event expiry age set.");
    }
  } catch (error) {
    logger.error("Error in expireEvents cron job", { error });
  }
};

/**
 * Cron job to find clusters with run expiry age set and log them.
 */
const expireRuns = async () => {
  logger.info("Running expireRuns cron job");
  try {
    const clustersWithExpiry = await db
      .select({ id: clusters.id })
      .from(clusters)
      .where(isNotNull(clusters.run_expiry_age));

    if (clustersWithExpiry.length > 0) {
      logger.info(
        `Found clusters with run expiry age set: ${clustersWithExpiry.map(c => c.id).join(", ")}`,
      );
      // TODO: Implement actual run expiration logic here
    } else {
      logger.info("No clusters found with run expiry age set.");
    }
  } catch (error) {
    logger.error("Error in expireRuns cron job", { error });
  }
};

/**
 * Cron job to find clusters with workflow execution expiry age set and log them.
 */
const expireWorkflowExecutions = async () => {
  logger.info("Running expireWorkflowExecutions cron job");
  try {
    const clustersWithExpiry = await db
      .select({ id: clusters.id })
      .from(clusters)
      .where(isNotNull(clusters.workflow_execution_expiry_age));

    if (clustersWithExpiry.length > 0) {
      logger.info(
        `Found clusters with workflow execution expiry age set: ${clustersWithExpiry.map(c => c.id).join(", ")}`,
      );
      // TODO: Implement actual workflow execution expiration logic here
    } else {
      logger.info("No clusters found with workflow execution expiry age set.");
    }
  } catch (error) {
    logger.error("Error in expireWorkflowExecutions cron job", { error });
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
};
