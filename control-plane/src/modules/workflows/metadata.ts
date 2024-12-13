import { and, eq, desc } from "drizzle-orm";
import { db, workflowMetadata, workflows } from "../data";

export const getRunsByMetadata = async ({
  clusterId,
  key,
  value,
  limit = 10,
  configId,
}: {
  clusterId: string;
  key: string;
  value: string;
  limit?: number;
  configId?: string;
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
      configId: workflows.config_id,
      configVersion: workflows.config_version,
      feedbackScore: workflows.feedback_score,
    })
    .from(workflowMetadata)
    .where(
      and(
        eq(workflowMetadata.cluster_id, clusterId),
        eq(workflowMetadata.key, key),
        eq(workflowMetadata.value, value),
        ...(configId ? [eq(workflows.config_id, configId)] : []),
      ),
    )
    .rightJoin(workflows, eq(workflowMetadata.workflow_id, workflows.id))
    .orderBy(desc(workflows.created_at))
    .limit(limit);
};

export const getWorkflowMetadata = async ({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}) => {
  const metadata = await db
    .select({
      key: workflowMetadata.key,
      value: workflowMetadata.value,
    })
    .from(workflowMetadata)
    .where(
      and(
        eq(workflowMetadata.cluster_id, clusterId),
        eq(workflowMetadata.workflow_id, runId),
      ),
    );

  return metadata.reduce(
    (acc, { key, value }) => {
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );
};
