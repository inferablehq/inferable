import { InferSelectModel, count, eq, gte, isNull } from "drizzle-orm";
import { env } from "../../utilities/env";
import * as cron from "../cron";
import * as data from "../data";
import { logger } from "../observability/logger";
import { S3 } from "@aws-sdk/client-s3";

const s3 = new S3();

const getServiceCount = async (timestamp: Date) => {
  const [result] = await data.db
    .select({
      count: count(data.services.service),
    })
    .from(data.services)
    .where(gte(data.services.timestamp, timestamp));

  return result.count ?? 0;
};

const getEmbedingCount = async (
  type: InferSelectModel<typeof data.embeddings>["type"],
) => {
  const [result] = await data.db
    .select({
      count: count(data.embeddings.id),
    })
    .from(data.embeddings)
    .where(eq(data.embeddings.type, type));

  return result.count ?? 0;
};

const getMachineCount = async (timestamp: Date) => {
  const [result] = await data.db
    .select({
      count: count(data.machines.id),
    })
    .from(data.machines)
    .where(gte(data.machines.last_ping_at, timestamp));

  return result.count ?? 0;
};

const getClusterCount = async () => {
  const [result] = await data.db
    .select({
      count: count(data.clusters.id),
    })
    .from(data.clusters)
    .where(isNull(data.clusters.deleted_at));

  return result.count ?? 0;
};

const populateAnalytics = async () => {
  if (!env.ANALYTICS_BUCKET_NAME) {
    return;
  }

  // Get the start of the previous hour
  const timestamp = new Date();
  timestamp.setMinutes(0, 0, 0);
  timestamp.setHours(timestamp.getHours() - 1);

  const existing = await data.db
    .select({})
    .from(data.analyticsSnapshots)
    .where(eq(data.analyticsSnapshots.timestamp, timestamp));

  if (existing.length > 0) {
    logger.info("Analytics window already populated", { timestamp: timestamp });
    return;
  }

  if (existing.length === 0) {
    logger.info("Populating analytics window", { timestamp: timestamp });

    const [
      activeServiceCount,
      activeFunctionCount,
      activeMachineCount,
      totalClusterCount,
    ] = await Promise.all([
      getServiceCount(timestamp),
      getEmbedingCount("service-function"),
      getMachineCount(timestamp),
      getClusterCount(),
    ]);

    const body = JSON.stringify({
      timestamp,
      activeServiceCount,
      activeFunctionCount,
      activeMachineCount,
      totalClusterCount,
    });

    await Promise.all([
      data.db
        .insert(data.analyticsSnapshots)
        .values({
          data: body,
          timestamp: timestamp,
        })
        .onConflictDoNothing(),
      env.ANALYTICS_BUCKET_NAME &&
        s3.putObject({
          Bucket: env.ANALYTICS_BUCKET_NAME,
          Key: `snapshots/${timestamp.toISOString()}.json`,
          Body: body,
        }),
    ]);
  }
};

export const start = () =>
  cron.registerCron(populateAnalytics, "analytics", {
    interval: 1000 * 60 * 30,
  }); // every 30 minutes
