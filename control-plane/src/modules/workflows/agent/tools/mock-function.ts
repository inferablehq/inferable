import { AgentError } from "../../../../utilities/errors";
import { logger } from "../../../observability/logger";
import {
  serviceFunctionEmbeddingId,
} from "../../../service-definitions";
import { AgentTool } from "../tool";

/**
 * Build a tool from a service function with a handler that immediately returns a mock result
 * Use when running test workflows
 */
export const buildMockFunctionTool = ({
  functionName,
  serviceName,
  description,
  schema,
  mockResult,
}: {
  functionName: string;
  serviceName: string;
  description?: string;
  schema?: string;
  mockResult: unknown;
}): AgentTool => {
  const toolName = serviceFunctionEmbeddingId({ serviceName, functionName });

  return new AgentTool({
    name: toolName,
    description: (
      description ?? `${serviceName}-${functionName} function`
    ).substring(0, 1024),
    schema,
    func: async (input: unknown) => {
      logger.info("Mock tool call", { toolName, input });

      return JSON.stringify({
        result: mockResult,
        resultType: "resolution",
        status: "success",
      });
    },
  });
};
