import { z } from "zod";
import { env } from "../../utilities/env";
import { logger } from "../observability/logger";
import { generateRunName } from "../runs/agent/run";
import { BaseMessage, baseMessageSchema } from "../sqs";
import { createQueue, QueueNames } from "./core";

interface GenerateNameMessage extends BaseMessage {
  runId: string;
  clusterId: string;
  content: string;
}

export async function handleRunNameGeneration(message: unknown) {
  if (env.NODE_ENV === "test") {
    logger.warn("Skipping run resume. NODE_ENV is set to 'test'.");
    return;
  }

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

  await generateRunName({
    id: runId,
    clusterId,
    content,
  });
}

export const runGenerateNameQueue = createQueue<GenerateNameMessage>(
  QueueNames.generateName,
  handleRunNameGeneration,
  {
    concurrency: 5,
  }
);
