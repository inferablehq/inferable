import assert from "assert";
import { z } from "zod";
import { AgentError, NotFoundError } from "../../../../utilities/errors";
import * as jobs from "../../../jobs/jobs";
import { logger } from "../../../observability/logger";
import { packer } from "../../../packer";
import { getServiceDefinition, serviceFunctionEmbeddingId } from "../../../service-definitions";
import { summariseJobResultIfNecessary } from "../summarizer";
import { AgentTool } from "../tool";

export const SpecialResultTypes = {
  jobTimeout: "inferableJobTimeout",
  interrupt: "interrupt",
} as const;

/**
 * Build a tool from a service function without any handler.
 * Used for attaching tools definitions to models, the concrete implementation is returned as needed.
 */
export const buildAbstractServiceFunctionTool = ({
  functionName,
  serviceName,
  description,
  schema,
}: {
  functionName: string;
  serviceName: string;
  description?: string;
  schema?: string;
}): AgentTool => {
  const toolName = serviceFunctionEmbeddingId({ serviceName, functionName });

  return new AgentTool({
    name: toolName,
    description: (description ?? `${serviceName}-${functionName} function`).substring(0, 1024),
    schema,
    func: async () => undefined,
  });
};

/**
 * Build a tool from a service function.
 * Used for executing tool calls.
 */
export const buildServiceFunctionTool = ({
  functionName,
  serviceName,
  toolCallId,
  description,
  schema,
  run,
}: {
  functionName: string;
  serviceName: string;
  toolCallId: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema?: string;
  run: {
    clusterId: string;
    id: string;
    enableSummarization?: boolean;
    authContext?: unknown;
    context?: unknown;
  };
}): AgentTool => {
  const tool = buildAbstractServiceFunctionTool({
    functionName,
    serviceName,
    description,
    schema,
  });

  tool.func = async input => {
    const requestArgs = packer.pack(input);

    const serviceDefinition = await getServiceDefinition({
      service: serviceName,
      owner: {
        clusterId: run.clusterId,
      },
    });

    if (!serviceDefinition) {
      throw new AgentError(`Service definition not found for ${serviceName}`);
    }

    const functionDefinition = serviceDefinition.functions?.find(f => f.name === functionName);

    if (!functionDefinition) {
      throw new AgentError(`Could not find function definition for ${functionName}`);
    }

    // This relies on idempotency based on toolCallId, this will be called multiple times:
    // - First tiem will create the job
    // - Subsequent times will return the job
    const { id } = await jobs.createJob({
      service: serviceName,
      targetFn: functionName,
      targetArgs: requestArgs,
      owner: {
        clusterId: run.clusterId,
      },
      authContext: run.authContext,
      runContext: run.context,
      runId: run.id,
      toolCallId,
    });

    const job = await jobs.getJob({
      jobId: id,
      clusterId: run.clusterId,
    });

    if (!job) {
      throw new NotFoundError("Coud not find job for function call");
    }

    const result = job?.result ? packer.unpack(job.result) : null;
    const resultType = job?.resultType;
    const status = job?.status;

    // TODO: Rename jobTimeout
    // This is a misnomer, we pause the run while waiting for jobs to resolve.
    if (["pending", "running"].includes(status)) {
      return JSON.stringify({
        result: JSON.stringify([id]),
        resultType: SpecialResultTypes.jobTimeout,
        status: "success",
      });
    }

    // This can happen on job / machine stall, where all retries are exhausted.
    if (!resultType || !result) {
      return JSON.stringify({
        result: {
          message: "Job did not return a result.",
        },
        resultType: "rejection",
        status: "failure",
      });
    }

    return JSON.stringify({
      result: run.enableSummarization
        ? await summariseJobResultIfNecessary({
          result,
          clusterId: run.clusterId,
          runId: run.id,
          targetFn: functionName,
        })
        : result,
      resultType,
      status,
    });
  };

  return tool;
};

const functionSchemaResponse = z.discriminatedUnion("resultType", [
  z.object({
    result: z.unknown(),
    resultType: z.literal(SpecialResultTypes.interrupt),
    status: z.string(),
  }),
  z.object({
    result: z.array(z.string()),
    resultType: z.literal(SpecialResultTypes.jobTimeout),
    status: z.string(),
  }),
  z.object({
    result: z.unknown(),
    resultType: z.literal("rejection"),
    status: z.string(),
  }),
  z.object({
    result: z.unknown(),
    resultType: z.literal("resolution"),
    status: z.string(),
  }),
]);

export const parseFunctionResponse = (response: string) => {
  assert(typeof response === "string", `Expected response to be a string, got ${typeof response}`);

  let parsed = null;

  try {
    parsed = JSON.parse(response);
    parsed.result = typeof parsed.result === "string" ? JSON.parse(parsed.result) : parsed.result;
  } catch (e) {
    // Allow for non-JSON result
  }

  const result = functionSchemaResponse.safeParse(parsed);

  if (result.success) {
    return result.data;
  } else {
    logger.error("Failed to parse response object", {
      response,
      error: result.error,
    });
    throw new AgentError(result.error.message ?? "Failed to parse response");
  }
};
