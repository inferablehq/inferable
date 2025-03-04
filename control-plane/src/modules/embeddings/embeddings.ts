import { db, embeddings } from "../data";

import * as crypto from "crypto";
import { and, cosineDistance, desc, eq, isNotNull, sql } from "drizzle-orm";
import { safeParse } from "../../utilities/safe-parse";
import { logger } from "../observability/logger";
import { redisClient } from "../redis";
import { buildModel } from "../models";

const setRawData = (value: unknown) => JSON.stringify({ value });

const getRawData = <Entity>(value: string) => JSON.parse(value).value as Entity;

const createEmbedding = async ({
  data,
  hash,
}: {
  data: string;
  hash: string;
}): Promise<number[]> => {
  const [existingEntity] = await db
    .select({ embedding_data: embeddings.embedding_1024 })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.raw_data_hash, hash),
        isNotNull(embeddings.embedding_1024),
      ),
    );

  if (existingEntity && existingEntity.embedding_data) {
    return existingEntity.embedding_data;
  } else {
    return await buildModel({ identifier: "embed-english-v3" }).embedQuery(
      data,
    );
  }
};

export const embedEntity = async <Entity>(
  clusterId: string,
  type: "service-function" | "knowledgebase-artifact",
  groupId: string,
  entityId: string,
  entity: Entity,
  tags?: string[],
) => {
  const rawDataHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(entity))
    .digest("hex");

  const existingEntity = await db
    .select({ id: embeddings.id })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.cluster_id, clusterId),
        eq(embeddings.type, type),
        eq(embeddings.group_id, groupId),
        eq(embeddings.id, entityId),
        eq(embeddings.raw_data_hash, rawDataHash),
      ),
    );

  if (existingEntity.length) {
    logger.debug("Entity already embedded", { clusterId, type, entityId });
    return;
  }

  const embedded = await createEmbedding({
    data: JSON.stringify(entity),
    hash: rawDataHash,
  });

  await db
    .insert(embeddings)
    .values([
      {
        cluster_id: clusterId,
        group_id: groupId,
        id: entityId,
        type,
        model: buildModel({ identifier: "embed-english-v3" }).identifier,
        embedding_1024: embedded,
        raw_data: setRawData(entity),
        raw_data_hash: rawDataHash,
        tags,
      },
    ])
    .onConflictDoUpdate({
      target: [embeddings.cluster_id, embeddings.id, embeddings.type],
      set: {
        embedding_1024: embedded,
        raw_data: setRawData(entity),
        raw_data_hash: rawDataHash,
        tags,
      },
    });
};

export const embedSearchQuery = async (query: string): Promise<number[]> => {
  const sha = crypto.createHash("sha256").update(query).digest("hex");

  const existing = await redisClient?.get(sha).catch(() => null);

  if (existing) {
    const unpacked = safeParse<number[]>(existing);

    if (!unpacked.success || !unpacked.data?.length) {
      logger.error("Error unpacking embedding", {
        unpacked,
      });

      await redisClient?.del(sha);
    } else {
      return unpacked.data;
    }
  }

  const embedding = await buildModel({
    identifier: "embed-english-v3",
  }).embedQuery(query);

  await redisClient
    ?.set(sha, JSON.stringify(embedding), {
      EX: 60 * 60 * 24, // 1 day
    })
    .catch(() => null);

  return embedding;
};

export const findSimilarEntities = async <Entity>(
  clusterId: string,
  type: "service-function" | "knowledgebase-artifact",
  query: string,
  limit: number = 10,
  tag?: string,
): Promise<
  (Entity & { embeddingId: string; similarity: number; tags: string[] })[]
> => {
  const embedding = await embedSearchQuery(query);

  const similarity = sql<number>`1 - (${cosineDistance(embeddings.embedding_1024, embedding)})`;

  const results = await db
    .select({
      id: embeddings.id,
      raw_data: embeddings.raw_data,
      similarity,
      tags: embeddings.tags,
    })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.cluster_id, clusterId),
        eq(embeddings.type, type),
        ...(tag ? [sql`${embeddings.tags}::jsonb ? '${sql.raw(tag)}'`] : []),
      ),
    )
    .orderBy((t) => desc(t.similarity))
    .limit(limit);

  return results.map((result) => {
    return {
      embeddingId: result.id,
      similarity: result.similarity,
      tags: result.tags ?? [],
      ...getRawData<Entity>(result.raw_data),
    } as Entity & { embeddingId: string; similarity: number; tags: string[] };
  });
};

export const deleteEmbeddings = async <Entity>(
  clusterId: string,
  type: "service-function" | "knowledgebase-artifact",
  groupId: string,
) => {
  await db
    .delete(embeddings)
    .where(
      and(
        eq(embeddings.cluster_id, clusterId),
        eq(embeddings.type, type),
        eq(embeddings.group_id, groupId),
      ),
    );
};

export const deleteEmbedding = async <Entity>(
  clusterId: string,
  type: "service-function" | "knowledgebase-artifact",
  entityId: string,
) =>
  await db
    .delete(embeddings)
    .where(
      and(
        eq(embeddings.cluster_id, clusterId),
        eq(embeddings.type, type),
        eq(embeddings.id, entityId),
      ),
    );

export const getEmbeddingsGroup = async <Entity>(
  clusterId: string,
  type: "service-function" | "knowledgebase-artifact",
  groupId: string,
) =>
  await db
    .select({ id: embeddings.id, raw_data: embeddings.raw_data })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.cluster_id, clusterId),
        eq(embeddings.type, type),
        eq(embeddings.group_id, groupId),
      ),
    );

export const getEntity = async <Entity>(
  clusterId: string,
  type: "service-function" | "knowledgebase-artifact",
  id: string,
): Promise<(Entity & { tags: string[] }) | undefined> => {
  const [entity] = await db
    .select({
      id: embeddings.id,
      raw_data: embeddings.raw_data,
      tags: embeddings.tags,
    })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.cluster_id, clusterId),
        eq(embeddings.type, type),
        eq(embeddings.id, id),
      ),
    );

  if (!entity) {
    return;
  }

  return {
    ...getRawData<Entity>(entity.raw_data),
    tags: entity.tags ?? [],
  };
};

export const getAllEmbeddings = async <Entity>(
  clusterId: string,
  type: "service-function" | "knowledgebase-artifact",
) =>
  await db
    .select({
      id: embeddings.id,
      raw_data: embeddings.raw_data,
      tags: embeddings.tags,
      groupId: embeddings.group_id,
      rawData: embeddings.raw_data,
    })
    .from(embeddings)
    .where(and(eq(embeddings.cluster_id, clusterId), eq(embeddings.type, type)))
    .then((results) =>
      results.map((result) => ({
        data: getRawData<Entity>(result.raw_data),
        tags: result.tags ?? [],
        id: result.id,
        groupId: result.groupId,
      })),
    );

export const getAllUniqueTags = async (
  clusterId: string,
  type: "service-function" | "knowledgebase-artifact",
) => {
  return db
    .select({
      tags: sql<string>`DISTINCT jsonb_array_elements_text(${embeddings.tags}::jsonb)`,
    })
    .from(embeddings)
    .where(and(eq(embeddings.cluster_id, clusterId), eq(embeddings.type, type)))
    .then((results) => results.map((r) => r.tags));
};

export const embeddableEntitiy = <Entity>() => {
  return {
    embedEntity: embedEntity<Entity>,
    findSimilarEntities: findSimilarEntities<Entity>,
    deleteEmbeddings: deleteEmbeddings<Entity>,
    deleteEmbedding: deleteEmbedding<Entity>,
    getEmbeddingsGroup: getEmbeddingsGroup<Entity>,
    getEntity: getEntity<Entity>,
    getAllEmbeddings: getAllEmbeddings<Entity>,
  };
};
