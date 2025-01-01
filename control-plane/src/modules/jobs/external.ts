import { Consumer } from "sqs-consumer";
import { env } from "../../utilities/env";
import { baseMessageSchema, sqs, withObservability } from "../sqs";
import { z } from "zod";
import { logger } from "../observability/logger";
import { getJob } from "./jobs";
import { externalServices } from "../integrations/constants";
import { getIntegrations, getInstallables } from "../integrations/integrations";

const externalCallConsumer = env.SQS_EXTERNAL_TOOL_CALL_QUEUE_URL
  ? Consumer.create({
      queueUrl: env.SQS_EXTERNAL_TOOL_CALL_QUEUE_URL,
      batchSize: 5,
      visibilityTimeout: 60,
      heartbeatInterval: 30,
      handleMessage: withObservability(env.SQS_EXTERNAL_TOOL_CALL_QUEUE_URL, handleExternalCall),
      sqs,
    })
  : undefined;

export const start = async () => {
  await Promise.all([externalCallConsumer?.start()]);
};

export const stop = async () => {
  externalCallConsumer?.stop();
};

async function handleExternalCall(message: unknown) {
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

  const service = externalServices.includes(zodResult.data.service);

  if (!service) {
    logger.error("Unknown external service", {
      service: zodResult.data.service,
    });

    return;
  }

  const [call, integrations] = await Promise.all([
    getJob({
      clusterId: zodResult.data.clusterId,
      jobId: zodResult.data.callId,
    }),
    getIntegrations({
      clusterId: zodResult.data.clusterId,
    }),
  ]);

  if (!call) {
    logger.error("Could not find call", {
      clusterId: zodResult.data.clusterId,
      callId: zodResult.data.callId,
    });
    return;
  }

  await getInstallables(zodResult.data.service).handleCall(call, integrations);
}
