import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createQueue } from "./core";
import { QueueNames } from "./core";
import { db, runs } from "../data";
import { logger } from "../observability/logger";
import { generateTitle } from "../runs/summarization";
import { BaseMessage, baseMessageSchema } from "../sqs";

interface GenerateNameMessage extends BaseMessage {
  runId: string;
  clusterId: string;
  content: string;
}

export async function handleRunNameGeneration(message: unknown) {
  const zodResult = baseMessageSchema
    .extend({
      content: z.string(),
    })
    .safeParse(message);

  if (!zodResult.success) {
    logger.error("Message does not conform to name generation schema", {
      error: zodResult.error,
      body: message,
    });
    return;
  }

  const { runId, clusterId, content } = zodResult.data;

  const result = await generateTitle(content, {
    id: runId,
    clusterId,
  });

  await db
    .update(runs)
    .set({ name: result.summary })
    .where(and(eq(runs.id, runId), eq(runs.cluster_id, clusterId)));
}

export const runGenerateNameQueue = createQueue<GenerateNameMessage>(
  QueueNames.generateName,
  handleRunNameGeneration,
  {
    concurrency: 5,
  }
);
