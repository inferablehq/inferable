import { z } from "zod";
import { logger } from "../observability/logger";
import { assertEphemeralClusterLimitations, getRun } from "../runs";
import { processRun } from "../runs/agent/run";
import { getRunTags } from "../runs/tags";
import { BaseMessage, baseMessageSchema } from "../sqs";
import { createQueue, QueueNames } from "./core";

interface RunProcessMessage extends BaseMessage {
  runId: string;
  clusterId: string;
}

export async function handleRunProcess(message: unknown) {
  const zodResult = baseMessageSchema
    .extend({
      runId: z.string(),
      clusterId: z.string(),
    })
    .safeParse(message);

  if (!zodResult.success) {
    logger.error("Message does not conform to run process schema", {
      error: zodResult.error,
      body: message,
    });
    return;
  }

  const { runId, clusterId } = zodResult.data;

  const [run, tags] = await Promise.all([
    getRun({ clusterId, runId }),
    getRunTags({ clusterId, runId }),
    assertEphemeralClusterLimitations(clusterId),
  ]);

  if (!run) {
    logger.error("Received job for unknown Run");
    return;
  }

  await processRun(run, tags);
}

export const runProcessQueue = createQueue<RunProcessMessage>(
  QueueNames.runProcess,
  handleRunProcess,
  {
    concurrency: 5,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true,
    },
  },
  data => data.runId
);
