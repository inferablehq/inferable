import { db, events, jobs } from "./data";
import { eq, sql } from "drizzle-orm";
import { createCache } from "../utilities/cache";

const cache = createCache<{
  functionCalls: { count: number };
  tokenUsage: { input: number; output: number };
  refreshedAt: number;
}>(Symbol("serverStats"));

export async function getServerStats() {
  const cached = await cache.get("server-stats");
  if (cached !== undefined) {
    return cached;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [functionCalls] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(jobs)
    .where(sql`created_at >= ${thirtyDaysAgo}`);

  const [tokenUsage] = await db
    .select({
      input: sql<number>`sum(token_usage_input)`,
      output: sql<number>`sum(token_usage_output)`,
    })
    .from(events)
    .where(sql`created_at >= ${thirtyDaysAgo}`);

  const [predictions] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(events)
    .where(sql`type = 'modelInvocation' AND created_at >= ${thirtyDaysAgo}`);

  const stats = {
    functionCalls,
    tokenUsage,
    predictions,
    refreshedAt: Date.now(),
  };

  // Cache for 10 minutes
  await cache.set("server-stats", stats, 1000 * 60 * 10);
  return stats;
}
