import { and, eq, like } from "drizzle-orm";
import { clusterKV, db } from "./data";

export const kv = {
  get: async (clusterId: string, key: string) => {
    const result = await db
      .select({
        value: clusterKV.value,
      })
      .from(clusterKV)
      .where(and(eq(clusterKV.key, key), eq(clusterKV.cluster_id, clusterId)));

    return result[0]?.value ?? null;
  },
  getAllByPrefix: async (clusterId: string, prefix: string) => {
    const result = await db
      .select({
        value: clusterKV.value,
        key: clusterKV.key,
        createdAt: clusterKV.created_at,
      })
      .from(clusterKV)
      .where(and(eq(clusterKV.cluster_id, clusterId), like(clusterKV.key, `${prefix}%`)));

    return result.map(r => ({
      value: r.value,
      key: r.key,
      createdAt: r.createdAt,
    }));
  },
  setOrReplace: async (clusterId: string, key: string, value: string) => {
    const result = await db
      .insert(clusterKV)
      .values({ key, value, cluster_id: clusterId })
      .onConflictDoUpdate({
        target: [clusterKV.cluster_id, clusterKV.key],
        set: { value },
      })
      .returning({
        value: clusterKV.value,
      });

    return result[0]?.value ?? null;
  },
  setIfNotExists: async (clusterId: string, key: string, value: string) => {
    const result = await db
      .insert(clusterKV)
      .values({ key, value, cluster_id: clusterId })
      .returning({
        value: clusterKV.value,
      })
      .onConflictDoNothing();

    return result[0]?.value ?? null;
  },
};
