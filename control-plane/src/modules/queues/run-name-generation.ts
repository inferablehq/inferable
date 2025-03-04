import { z } from "zod";
import { env } from "../../utilities/env";
import { logger } from "../observability/logger";
import { generateRunName } from "../runs/agent/run";
import { createQueue, QueueNames } from "./core";
import { BaseMessage, baseMessageSchema } from "./observability";

interface GenerateNameMessage extends BaseMessage {
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
  },
);
