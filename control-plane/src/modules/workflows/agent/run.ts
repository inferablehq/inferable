import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { NotFoundError } from "../../../utilities/errors";
import { getClusterContextText } from "../../cluster";
import { workflows } from "../../data";
import { embedSearchQuery } from "../../embeddings/embeddings";
import { flagsmith } from "../../flagsmith";
import { logger } from "../../observability/logger";
import {
  embeddableServiceFunction,
  getServiceDefinitions,
  serviceFunctionEmbeddingId,
} from "../../service-definitions";
import { getToolMetadata } from "../../tool-metadata";
import { notifyNewMessage, notifyStatusChange } from "../notify";
import { getWorkflowMessages, insertRunMessage } from "../workflow-messages";
import { Run, getWaitingJobIds, updateWorkflow } from "../workflows";
import { createWorkflowAgent } from "./agent";
import { mostRelevantKMeansCluster } from "./nodes/tool-parser";
import { WorkflowAgentState } from "./state";
import {
  buildAbstractServiceFunctionTool,
  buildServiceFunctionTool,
} from "./tools/functions";
import {
  ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME,
  buildAccessKnowledgeArtifacts,
} from "./tools/knowledge-artifacts";
import { buildMockFunctionTool } from "./tools/mock-function";
import { getClusterInternalTools } from "./tools/cluster-internal-tools";
import { buildCurrentDateTimeTool } from "./tools/date-time";
import { CURRENT_DATE_TIME_TOOL_NAME } from "./tools/date-time";
import { env } from "../../../utilities/env";
import { events } from "../../observability/events";

/**
 * Run a workflow from the most recent saved state
 **/
export const processRun = async (
  run: Run,
  metadata?: Record<string, string>,
) => {
  logger.info("Running workflow");

  // Parallelize fetching additional context and service definitions
  const [
    additionalContext,
    serviceDefinitions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _updateResult,
    internalToolsMap,
  ] = await Promise.all([
    buildAdditionalContext(run),
    getServiceDefinitions({
      clusterId: run.clusterId,
    }),
    updateWorkflow({
      ...run,
      status: "running",
    }),
    getClusterInternalTools(run.clusterId),
  ]);

  const allAvailableTools: string[] = [];
  const attachedFunctions = run.attachedFunctions ?? [];

  allAvailableTools.push(...attachedFunctions);

  serviceDefinitions.flatMap((service) =>
    (service.definition.functions ?? []).forEach((f) => {
      // Do not attach additional tools if `attachedFunctions` is provided
      if (attachedFunctions.length > 0 || f.config?.private) {
        return;
      }

      allAvailableTools.push(
        serviceFunctionEmbeddingId({
          serviceName: service.definition.name,
          functionName: f.name,
        }),
      );
    }),
  );

  const mockToolsMap: Record<string, DynamicStructuredTool> =
    await buildMockTools(run);

  let mockModelResponses;
  if (
    !!env.LOAD_TEST_CLUSTER_ID &&
    run.clusterId === env.LOAD_TEST_CLUSTER_ID
  ) {
    logger.info("Mocking model responses for load test");

    //https://github.com/inferablehq/inferable/blob/main/load-tests/script.js
    mockModelResponses = [
      JSON.stringify({
        done: false,
        invocations: [
          {
            toolName: "default_searchHaystack",
            input: {},
          },
        ],
      }),
      JSON.stringify({
        done: true,
        result: {
          word: "needle",
        },
      }),
    ];
  }

  const app = await createWorkflowAgent({
    workflow: run,
    mockModelResponses,
    allAvailableTools,
    additionalContext,
    getTool: async (toolCall) => {
      if (!toolCall.id) {
        throw new Error("Can not return tool without call ID");
      }

      const mockTool = mockToolsMap[toolCall.toolName];

      if (mockTool) {
        return mockTool;
      }

      const internalTool = internalToolsMap[toolCall.toolName];

      if (internalTool) {
        return internalTool(run, toolCall.id);
      }

      const serviceFunctionDetails = await embeddableServiceFunction.getEntity(
        run.clusterId,
        "service-function",
        toolCall.toolName,
      );

      if (serviceFunctionDetails) {
        return buildServiceFunctionTool({
          ...serviceFunctionDetails,
          schema: serviceFunctionDetails.schema,
          workflow: run,
          toolCallId: toolCall.id!,
        });
      }

      throw new NotFoundError(`Tool not found: ${toolCall.toolName}`);
    },
    findRelevantTools,
    postStepSave: async (state) => {
      logger.debug("Saving run state", {
        runId: run.id,
        clusterId: run.clusterId,
      });

      if (attachedFunctions.length == 0) {
        // optimistically embed the next search query
        // this is not critical to the workflow, so we can do it in the background
        embedSearchQuery(
          state.messages.map((m) => JSON.stringify(m.data)).join(" "),
        );
      }

      // Insert messages in a loop to ensure they are created with differing timestamps
      for (const message of state.messages.filter((m) => !m.persisted)) {
        await Promise.all([
          insertRunMessage(message),
          notifyNewMessage({ message, metadata }),
        ]);
        message.persisted = true;
      }
    },
  });

  const [messages, waitingJobIds] = await Promise.all([
    getWorkflowMessages({
      clusterId: run.clusterId,
      runId: run.id,
    }),
    getWaitingJobIds({
      clusterId: run.clusterId,
      runId: run.id,
    }),
  ]);

  try {
    const output = await app.invoke(
      {
        messages: messages.map((m) => ({
          ...m,
          persisted: true,
        })),
        waitingJobs: waitingJobIds,
        status: run.status,
      },
      {
        recursionLimit: 100,
      },
    );

    const parsedOutput = z
      .object({
        status: z.enum(workflows.status.enumValues),
        result: z.any().optional(),
        waitingJobs: z.array(z.string()),
      })
      .safeParse(output);

    if (!parsedOutput.success) {
      logger.error("Failed to parse workflow output", {
        parsedOutput,
      });
      throw new Error("Received unexpected workflow output state");
    }

    await updateWorkflow({
      ...run,
      status: parsedOutput.data.status,
    });

    const waitingJobs = parsedOutput.data.waitingJobs;

    await notifyStatusChange({
      run,
      status: parsedOutput.data.status,
      result: parsedOutput.data.result,
    });

    if (parsedOutput.data.status === "paused") {
      logger.info("Workflow paused", {
        waitingJobs,
      });

      return;
    }

    logger.info("Processing workflow complete");
  } catch (error) {
    logger.warn("Processing workflow failed", {
      error,
    });

    let failureReason = "An unknown error occurred during workflow processing.";
    if (error instanceof Error) {
      failureReason = error.message;
    }

    await updateWorkflow({
      ...run,
      status: "failed",
      failureReason,
    });

    throw error;
  }
};

async function findRelatedFunctionTools(workflow: Run, search: string) {
  const flags = await flagsmith?.getIdentityFlags(workflow.clusterId, {
    clusterId: workflow.clusterId,
  });

  const useKmeans = flags?.isFeatureEnabled("use_kmeans_clustering");

  const relatedToolsSearchResults = search
    ? await embeddableServiceFunction.findSimilarEntities(
        workflow.clusterId,
        "service-function",
        search,
        30,
      )
    : [];

  let relatedTools = relatedToolsSearchResults;

  if (useKmeans && relatedToolsSearchResults?.length > 1) {
    logger.info("Using kmeans clustering for related tool search");
    relatedTools = mostRelevantKMeansCluster(relatedToolsSearchResults);
  }

  const toolContexts = await Promise.all(
    relatedTools.map(async (toolDetails) => {
      const metadata = await getToolMetadata(
        workflow.clusterId,
        toolDetails.serviceName,
        toolDetails.functionName,
      );

      const contextArr = [];

      if (metadata?.additionalContext) {
        contextArr.push(`<context>${metadata.additionalContext}</context>`);
      }

      if (metadata?.resultKeys) {
        contextArr.push(
          `<result_keys>${metadata.resultKeys
            .slice(0, 10)
            .map((k) => k.key)}</result_keys>`,
        );
      }

      return {
        serviceName: toolDetails.serviceName,
        functionName: toolDetails.functionName,
        toolContext: contextArr.join("\n\n"),
      };
    }),
  );

  const selectedTools = relatedTools.map((toolDetails) =>
    buildAbstractServiceFunctionTool({
      ...toolDetails,
      description: [
        toolDetails.description,
        toolContexts.find(
          (c) =>
            c?.serviceName === toolDetails.serviceName &&
            c?.functionName === toolDetails.functionName,
        )?.toolContext,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: toolDetails.schema,
    }),
  );

  return selectedTools;
}

const buildAdditionalContext = async (run: Run) => {
  let context = "";

  context += await getClusterContextText(run.clusterId);
  context += `\nCurrent workflow URL: https://app.inferable.ai/clusters/${run.clusterId}/workflows/${run.id}`;
  run.systemPrompt && (context += `\n${run.systemPrompt}`);

  return context;
};

export const findRelevantTools = async (state: WorkflowAgentState) => {
  const start = Date.now();
  const workflow = state.workflow;

  const tools: DynamicStructuredTool[] = [];
  const attachedFunctions = workflow.attachedFunctions ?? [];

  // If functions are explicitly attached, skip relevant tools search
  if (attachedFunctions.length > 0) {
    for (const tool of attachedFunctions) {
      if (tool.toLowerCase().startsWith("inferable_")) {
        const internalToolName = tool.split("_")[1];

        if (internalToolName === ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME) {
          tools.push(await buildAccessKnowledgeArtifacts(workflow));
          continue;
        }

        if (internalToolName === CURRENT_DATE_TIME_TOOL_NAME) {
          tools.push(buildCurrentDateTimeTool());
          continue;
        }
      }

      const serviceFunctionDetails = await embeddableServiceFunction.getEntity(
        workflow.clusterId,
        "service-function",
        tool,
      );

      if (!serviceFunctionDetails) {
        throw new Error(
          `Tool ${tool} not found in cluster ${workflow.clusterId}`,
        );
      }

      tools.push(
        buildAbstractServiceFunctionTool({
          ...serviceFunctionDetails,
          schema: serviceFunctionDetails.schema,
        }),
      );
    }
  } else {
    const found = await findRelatedFunctionTools(
      workflow,
      state.messages.map((m) => JSON.stringify(m.data)).join(" "),
    );

    tools.push(...found);

    const accessKnowledgeArtifactsTool =
      await buildAccessKnowledgeArtifacts(workflow);

    // When tools are not specified, attach all internalTools
    tools.push(accessKnowledgeArtifactsTool);

    events.write({
      type: "functionRegistrySearchCompleted",
      workflowId: workflow.id,
      clusterId: workflow.clusterId,
      meta: {
        duration: Date.now() - start,
        tools: tools.map((t) => t.name),
      },
    });
  }

  return tools;
};

export const buildMockTools = async (workflow: Run) => {
  const mocks: Record<string, DynamicStructuredTool> = {};
  if (!workflow.testMocks || Object.keys(workflow.testMocks).length === 0) {
    return mocks;
  }

  if (!workflow.test) {
    logger.warn(
      "Workflow is not marked as test enabled but contains mocks. Mocks will be ignored.",
    );
    return mocks;
  }

  const serviceDefinitions = await getServiceDefinitions({
    clusterId: workflow.clusterId,
  });

  for (const [key, value] of Object.entries(workflow.testMocks)) {
    const [serviceName, functionName] = key.split("_");
    if (!serviceName || !functionName) {
      logger.warn("Invalid mock key", {
        key,
      });
      continue;
    }

    const mockResult = value.output;
    if (!mockResult) {
      logger.warn("Invalid mock output", {
        key,
        value,
      });
      continue;
    }

    const serviceDefinition = serviceDefinitions.find(
      (sd) => sd.service === serviceName,
    );

    if (!serviceDefinition) {
      logger.warn(
        "Service definition not found for mock. Mocks must refer to existing services.",
        {
          key,
          serviceName,
        },
      );
      continue;
    }

    const functionDefinition = serviceDefinition.definition.functions?.find(
      (f) => f.name === functionName,
    );

    if (!functionDefinition) {
      logger.warn(
        "Function definition not found for mock. Mocks must refer to existing functions.",
        {
          key,
          serviceName,
          functionName,
        },
      );
      continue;
    }

    mocks[key] = buildMockFunctionTool({
      functionName,
      serviceName,
      description: functionDefinition.description,
      schema: functionDefinition.schema,
      mockResult,
    });
  }

  const mockKeys = Object.keys(mocks);
  if (mockKeys.length > 0) {
    logger.info("Built mock tools", {
      mockKeys,
    });
  }

  return mocks;
};
