import { and, eq } from "drizzle-orm";
import { db, toolMetadata } from "./data";
import { filterMostExpressiveKeys } from "./result-keys";

export async function upsertUserDefinedContext(metadata: {
  cluster_id: string;
  service: string;
  function_name: string;
  user_defined_context: string | null;
}): Promise<void> {
  await db
    .insert(toolMetadata)
    .values(metadata)
    .onConflictDoUpdate({
      target: [
        toolMetadata.cluster_id,
        toolMetadata.service,
        toolMetadata.function_name,
      ],
      set: {
        user_defined_context: metadata.user_defined_context,
      },
    });
}

export async function upsertResultKeys(metadata: {
  clusterId: string;
  service: string;
  functionName: string;
  result: string;
}): Promise<void> {
  const [existingMetadata] = await db
    .select({ result_keys: toolMetadata.result_keys })
    .from(toolMetadata)
    .where(
      and(
        eq(toolMetadata.cluster_id, metadata.clusterId),
        eq(toolMetadata.service, metadata.service),
        eq(toolMetadata.function_name, metadata.functionName),
      ),
    )
    .limit(1);

  const parsedResult = JSON.parse(metadata.result);
  const mostExpressiveKeys = filterMostExpressiveKeys(
    parsedResult,
    existingMetadata?.result_keys,
  );

  await db
    .insert(toolMetadata)
    .values({
      result_keys: mostExpressiveKeys,
      cluster_id: metadata.clusterId,
      service: metadata.service,
      function_name: metadata.functionName,
    })
    .onConflictDoUpdate({
      target: [
        toolMetadata.cluster_id,
        toolMetadata.service,
        toolMetadata.function_name,
      ],
      set: {
        result_keys: mostExpressiveKeys,
      },
    });
}

export async function getToolMetadata(
  cluster_id: string,
  service: string,
  function_name: string,
) {
  const [result] = await db
    .select({
      additionalContext: toolMetadata.user_defined_context,
    })
    .from(toolMetadata)
    .where(
      and(
        eq(toolMetadata.cluster_id, cluster_id),
        eq(toolMetadata.service, service),
        eq(toolMetadata.function_name, function_name),
      ),
    )
    .limit(1);

  return result ?? null;
}

export async function deleteToolMetadata(
  cluster_id: string,
  service: string,
  function_name: string,
) {
  await db
    .delete(toolMetadata)
    .where(
      and(
        eq(toolMetadata.cluster_id, cluster_id),
        eq(toolMetadata.service, service),
        eq(toolMetadata.function_name, function_name),
      ),
    );
}
