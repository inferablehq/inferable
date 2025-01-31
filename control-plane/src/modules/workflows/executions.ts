import { z } from "zod";
import * as jobs from "../jobs/jobs";
import { packer } from "../packer";
import { getClusterBackgroundRun } from "../runs";
import { getWorkflowServices } from "../service-definitions";

export const createWorkflowExecution = async (
  clusterId: string,
  workflowName: string,
  input: unknown
) => {
  const parsed = z
    .object({
      executionId: z.string(),
    })
    .safeParse(input);

  if (!parsed.success) {
    throw new Error("Invalid input");
  }

  const services = await getWorkflowServices({ clusterId, workflowName });

  if (services.length === 0) {
    throw new Error(`No workflow registration for ${workflowName}`);
  }

  const latestService = services.reduce((latest, service) => {
    if (service.version > latest.version) {
      return service;
    }

    return latest;
  }, services[0]);

  const job = await jobs.createJob({
    owner: { clusterId },
    service: latestService.service,
    targetFn: "handler",
    targetArgs: packer.pack(parsed.data),
    runId: getClusterBackgroundRun(clusterId), // we don't really care about the run semantics here, only that it's a job that gets picked up by the worker at least once
  });

  return { jobId: job.id };
};
