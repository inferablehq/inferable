import { and, eq, desc } from "drizzle-orm";
import { db, runTags, runs } from "../data";

export const getRunsByTag = async ({
  clusterId,
  key,
  value,
  limit = 10,
  userId,
  agentId,
}: {
  clusterId: string;
  key: string;
  value: string;
  limit?: number;
  agentId?: string;
  userId?: string
}) => {
  return await db
    .select({
      id: runs.id,
      name: runs.name,
      userId: runs.user_id,
      clusterId: runs.cluster_id,
      status: runs.status,
      createdAt: runs.created_at,
      failureReason: runs.failure_reason,
      debug: runs.debug,
      test: runs.test,
      agentId: runs.agent_id,
      agentVersion: runs.agent_version,
      feedbackScore: runs.feedback_score,
    })
    .from(runTags)
    .where(
      and(
        eq(runTags.cluster_id, clusterId),
        eq(runTags.key, key),
        eq(runTags.value, value),
        ...(agentId ? [eq(runs.agent_id, agentId)] : []),
        ...(userId ? [eq(runs.user_id, userId)] : []),
      ),
    )
    .rightJoin(runs, eq(runTags.workflow_id, runs.id))
    .orderBy(desc(runs.created_at))
    .limit(limit);
};

export const getRunTags = async ({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}) => {
  const tags = await db
    .select({
      key: runTags.key,
      value: runTags.value,
    })
    .from(runTags)
    .where(
      and(
        eq(runTags.cluster_id, clusterId),
        eq(runTags.workflow_id, runId),
      ),
    );

  return tags.reduce(
    (acc, { key, value }) => {
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );
};
