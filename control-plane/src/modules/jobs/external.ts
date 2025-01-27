import { z } from "zod";
import { externalServices } from "../integrations/constants";
import { getInstallables, getIntegrations } from "../integrations/integrations";
import { logger } from "../observability/logger";
import { baseMessageSchema } from "../sqs";
import { getJob } from "./jobs";

export async function handleExternalCall(message: unknown) {
  const zodResult = baseMessageSchema
    .extend({
      jobId: z.string(),
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
      jobId: zodResult.data.jobId,
    }),
    getIntegrations({
      clusterId: zodResult.data.clusterId,
    }),
  ]);

  if (!call) {
    logger.error("Could not find Job", {
      clusterId: zodResult.data.clusterId,
      jobId: zodResult.data.jobId,
    });
    return;
  }

  await getInstallables(zodResult.data.service).handleCall(call, integrations);
}
