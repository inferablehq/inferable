import { AgentError } from "../../../../utilities/errors";
import { logger } from "../../../observability/logger";
import {
  deserializeFunctionSchema,
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
  schema: unknown;
  mockResult: unknown;
}): AgentTool => {
  const toolName = serviceFunctionEmbeddingId({ serviceName, functionName });

  let deserialized = null;

  try {
    deserialized = deserializeFunctionSchema(schema);
  } catch (e) {
    logger.error(
      `Failed to deserialize schema for ${toolName} (${serviceName}.${functionName})`,
      { schema, error: e },
    );
    throw new AgentError(
      `Failed to deserialize schema for ${toolName} (${serviceName}.${functionName})`,
    );
  }

  return new AgentTool({
    name: toolName,
    description: (
      description ?? `${serviceName}-${functionName} function`
    ).substring(0, 1024),
    schema: deserialized,
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
