import { Consumer } from "sqs-consumer";
import { env } from "../../utilities/env";
import { BaseMessage, baseMessageSchema, sqs, withObservability } from "../sqs";
import { z } from "zod";
import { logger } from "../observability/logger";
import { handleCall } from "../integrations/toolhouse";
import { getJob } from "./jobs";

export const externalServices = ["ToolHouse"];

const externalCallConsumer = env.SQS_EXTERNAL_TOOL_CALL_QUEUE_URL
  ? Consumer.create({
      queueUrl: env.SQS_EXTERNAL_TOOL_CALL_QUEUE_URL,
      batchSize: 5,
      visibilityTimeout: 60,
      heartbeatInterval: 30,
      handleMessage: withObservability(
        env.SQS_EXTERNAL_TOOL_CALL_QUEUE_URL,
        handleExternalCall,
      ),
      sqs,
    })
  : undefined;

export const start = async () => {
  await Promise.all([externalCallConsumer?.start()]);
};

export const stop = async () => {
  externalCallConsumer?.stop();
};

async function handleExternalCall(message: BaseMessage) {
  const zodResult = baseMessageSchema
    .extend({
      callId: z.string(),
      service: z.string(),
    })
    .safeParse(message);

  if (!zodResult.success) {
    logger.error("Message does not conform to external call schema", {
      error: zodResult.error,
      body: message,
    });
    return;
  }

  if (!externalServices.includes(zodResult.data.service)) {
    logger.error("Unknown external service", {
      service: zodResult.data.service,
    });

    return;
  }

  const call = await getJob({
    clusterId: zodResult.data.clusterId,
    jobId: zodResult.data.callId,
  });

  if (!call) {
    logger.error("Could not find call", {
      clusterId: zodResult.data.clusterId,
      callId: zodResult.data.callId,
    });
    return;
  }

  //Currently only toolhouse is supported
  await handleCall({
    call,
    clusterId: zodResult.data.clusterId,
  });
}
