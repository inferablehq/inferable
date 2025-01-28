import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import * as data from "./data";
import { blobSchema } from "./contract";
import { ulid } from "ulid";

export const getBlobsForJobs = async ({
  jobIds,
  clusterId,
}: {
  jobIds: string[];
  clusterId: string;
}): Promise<z.infer<typeof blobSchema>[]> => {
  if (jobIds.length === 0) {
    return [];
  }
  const blobs = await data.db
    .select({
      id: data.blobs.id,
      name: data.blobs.name,
      type: data.blobs.type,
      encoding: data.blobs.encoding,
      size: data.blobs.size,
      createdAt: data.blobs.created_at,
      jobId: data.blobs.job_id,
      runId: data.blobs.run_id,
    })
    .from(data.blobs)
    .where(
      and(
        inArray(data.blobs.job_id, jobIds),
        eq(data.blobs.cluster_id, clusterId),
      ),
    );

  return blobs;
};

export const getBlobData = async ({
  blobId,
  clusterId,
}: {
  blobId: string;
  clusterId: string;
}): Promise<
  z.infer<typeof blobSchema> & { data: string; runId: string | null }
> => {
  const [blob] = await data.db
    .select({
      id: data.blobs.id,
      name: data.blobs.name,
      type: data.blobs.type,
      encoding: data.blobs.encoding,
      data: data.blobs.data,
      runId: data.blobs.run_id,
      size: data.blobs.size,
      createdAt: data.blobs.created_at,
      jobId: data.blobs.job_id,
    })
    .from(data.blobs)
    .where(
      and(eq(data.blobs.id, blobId), eq(data.blobs.cluster_id, clusterId)),
    );

  return blob;
};

export const createBlob = async ({
  clusterId,
  runId,
  jobId,
  name,
  type,
  encoding,
  data: rawData,
  size,
}: {
  clusterId: string;
  runId?: string;
  jobId?: string;
  name: string;
  type: z.infer<typeof blobSchema>["type"];
  encoding: z.infer<typeof blobSchema>["encoding"];
  data: string;
  size: number;
}): Promise<{ id: string }> => {
  const [blob] = await data.db
    .insert(data.blobs)
    .values({
      id: ulid(),
      name,
      type,
      encoding,
      size,
      data: rawData,
      job_id: jobId,
      run_id: runId,
      cluster_id: clusterId,
      created_at: new Date(),
    })
    .returning({
      id: data.blobs.id,
    });

  return blob;
};
