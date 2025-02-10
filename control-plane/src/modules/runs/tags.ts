import { and, eq, desc } from "drizzle-orm";
import { db, runTags, runs } from "../data";

export const getRunsByTag = async ({
  clusterId,
  key,
  value,
  limit = 10,
  userId,
}: {
  clusterId: string;
  key: string;
  value: string;
  limit?: number;
  userId?: string;
}) => {
  return await db
    .select({
      id: runs.id,
      name: runs.name,
      userId: runs.user_id,
      clusterId: runs.cluster_id,
      type: runs.type,
      status: runs.status,
      createdAt: runs.created_at,
      failureReason: runs.failure_reason,
      debug: runs.debug,
      test: runs.test,
      feedbackScore: runs.feedback_score,
      workflowExecutionId: runs.workflow_execution_id,
      workflowVersion: runs.workflow_version,
      workflowName: runs.workflow_name,
    })
    .from(runTags)
    .where(
      and(
        eq(runTags.cluster_id, clusterId),
        eq(runTags.key, key),
        eq(runTags.value, value),
        ...(userId ? [eq(runs.user_id, userId)] : [])
      )
    )
    .rightJoin(runs, eq(runTags.run_id, runs.id))
    .orderBy(desc(runs.created_at))
    .limit(limit);
};

export const getRunTags = async ({ clusterId, runId }: { clusterId: string; runId: string }) => {
  const tags = await db
    .select({
      key: runTags.key,
      value: runTags.value,
    })
    .from(runTags)
    .where(and(eq(runTags.cluster_id, clusterId), eq(runTags.run_id, runId)));

  return tags.reduce(
    (acc, { key, value }) => {
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>
  );
};
