import { and, eq, desc } from "drizzle-orm";
import { db, runTags, workflows } from "../data";

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
      id: workflows.id,
      name: workflows.name,
      userId: workflows.user_id,
      clusterId: workflows.cluster_id,
      status: workflows.status,
      createdAt: workflows.created_at,
      failureReason: workflows.failure_reason,
      debug: workflows.debug,
      test: workflows.test,
      agentId: workflows.agent_id,
      agentVersion: workflows.agent_version,
      feedbackScore: workflows.feedback_score,
    })
    .from(runTags)
    .where(
      and(
        eq(runTags.cluster_id, clusterId),
        eq(runTags.key, key),
        eq(runTags.value, value),
        ...(agentId ? [eq(workflows.agent_id, agentId)] : []),
        ...(userId ? [eq(workflows.user_id, userId)] : []),
      ),
    )
    .rightJoin(workflows, eq(runTags.workflow_id, workflows.id))
    .orderBy(desc(workflows.created_at))
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
