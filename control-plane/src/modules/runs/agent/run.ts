import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getWaitingJobIds } from "../";
import { env } from "../../../utilities/env";
import { NotFoundError } from "../../../utilities/errors";
import { getClusterContextText } from "../../cluster";
import { onStatusChangeSchema } from "../../contract";
import { db, runs } from "../../data";
import { embedSearchQuery } from "../../embeddings/embeddings";
import { flagsmith } from "../../flagsmith";
import { getLatestJobsResultedByFunctionName } from "../../jobs/jobs";
import { ChatIdentifiers } from "../../models/routing";
import { logger } from "../../observability/logger";
import {
  embeddableServiceFunction,
  getServiceDefinitions,
  ServiceDefinition,
  ServiceDefinitionFunction,
  serviceFunctionEmbeddingId,
} from "../../service-definitions";
import { getRunMessages, insertRunMessage } from "../messages";
import { notifyNewMessage, notifyStatusChange } from "../notify";
import { generateTitle } from "../summarization";
import { createRunGraph } from "./agent";
import { mostRelevantKMeansCluster } from "./nodes/tool-parser";
import { AgentTool } from "./tool";
import { findRelevantTools } from "./tool-search";
import { buildAbstractServiceFunctionTool, buildServiceFunctionTool } from "./tools/functions";
import { buildMockFunctionTool } from "./tools/mock-function";
import { availableStdlib } from "./tools/stdlib";

/**
 * Run a Run from the most recent saved state
 **/
export const processRun = async (
  run: {
    id: string;
    clusterId: string;
    modelIdentifier: ChatIdentifiers | null;
    resultSchema: unknown | null;
    debug: boolean;
    attachedFunctions: string[] | null;
    status: string;
    systemPrompt: string | null;
    testMocks: Record<string, { output: Record<string, unknown> }> | null;
    test: boolean;
    reasoningTraces: boolean;
    enableResultGrounding: boolean;
    onStatusChange: z.infer<typeof onStatusChangeSchema> | null;
    authContext: unknown | null;
    context: unknown | null;
  },
  tags?: Record<string, string>,
  mockModelResponses?: string[]
) => {
  logger.info("Processing Run");

  // Parallelize fetching additional context and service definitions
  const [
    additionalContext,
    serviceDefinitions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _updateResult,
  ] = await Promise.all([
    buildAdditionalContext(run),
    getServiceDefinitions({
      clusterId: run.clusterId,
    }),
    db.update(runs).set({ status: "running", failure_reason: "" }).where(eq(runs.id, run.id)),
  ]);

  const allAvailableTools: string[] = [];
  const attachedFunctions = run.attachedFunctions ?? [];

  allAvailableTools.push(...attachedFunctions);

  serviceDefinitions.flatMap((service: { service: string; definition: ServiceDefinition }) =>
    (service.definition?.functions ?? []).forEach((f: ServiceDefinitionFunction) => {
      // Do not attach additional tools if `attachedFunctions` is provided
      if (attachedFunctions.length > 0 || f.config?.private) {
        return;
      }

      allAvailableTools.push(
        serviceFunctionEmbeddingId({
          serviceName: service.definition.name,
          functionName: f.name,
        })
      );
    })
  );

  const mockToolsMap: Record<string, AgentTool> = await buildMockTools(run);

  if (!!env.LOAD_TEST_CLUSTER_ID && run.clusterId === env.LOAD_TEST_CLUSTER_ID) {
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

  if (mockModelResponses) {
    logger.info("Mocking model responses for load test");
  }

  const app = await createRunGraph({
    run: run,
    mockModelResponses,
    allAvailableTools,
    additionalContext,
    getTool: async toolCall => {
      if (!toolCall.id) {
        throw new Error("Can not return tool without call ID");
      }

      const mockTool = mockToolsMap[toolCall.toolName];

      if (mockTool) {
        return mockTool;
      }

      const internalTool = availableStdlib()[toolCall.toolName];

      if (internalTool) {
        return internalTool;
      }

      const serviceFunctionDetails = await embeddableServiceFunction.getEntity(
        run.clusterId,
        "service-function",
        toolCall.toolName
      );

      if (serviceFunctionDetails) {
        return buildServiceFunctionTool({
          ...serviceFunctionDetails,
          schema: serviceFunctionDetails.schema,
          run: run,
          toolCallId: toolCall.id!,
        });
      }

      throw new NotFoundError(`Tool not found: ${toolCall.toolName}`);
    },
    findRelevantTools,
    postStepSave: async state => {
      logger.debug("Saving run state", {
        runId: run.id,
        clusterId: run.clusterId,
      });

      if (attachedFunctions.length == 0) {
        // optimistically embed the next search query
        // this is not critical to the Run, so we can do it in the background
        embedSearchQuery(state.messages.map(m => JSON.stringify(m.data)).join(" "));
      }

      // Insert messages in a loop to ensure they are created with differing timestamps
      for (const message of state.messages.filter(m => !m.persisted)) {
        await Promise.allSettled([insertRunMessage(message), notifyNewMessage({ message, tags })]);
        message.persisted = true;
      }
    },
  });

  const [messages, waitingJobIds] = await Promise.all([
    getRunMessages({
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
        messages: messages.map(m => ({
          ...m,
          persisted: true,
        })),
        waitingJobs: waitingJobIds,
        status: run.status,
      },
      {
        recursionLimit: 100,
      }
    );

    const parsedOutput = z
      .object({
        status: z.enum(runs.status.enumValues),
        result: z.any().optional(),
        waitingJobs: z.array(z.string()),
      })
      .safeParse(output);

    if (!parsedOutput.success) {
      logger.error("Failed to parse Run output", {
        parsedOutput,
      });
      throw new Error("Received unexpected Run output state");
    }

    await db
      .update(runs)
      .set({ status: parsedOutput.data.status })
      .where(and(eq(runs.id, run.id), eq(runs.cluster_id, run.clusterId)));

    const waitingJobs = parsedOutput.data.waitingJobs;

    await notifyStatusChange({
      run: {
        id: run.id,
        clusterId: run.clusterId,
        onStatusChange: run.onStatusChange,
        status: run.status,
        authContext: run.authContext,
        context: run.context,
      },
      status: parsedOutput.data.status,
      result: parsedOutput.data.result,
    });

    if (parsedOutput.data.status === "paused") {
      logger.info("Run paused", {
        waitingJobs,
      });

      return;
    }

    logger.info("Processing Run complete");
  } catch (error) {
    logger.warn("Processing Run failed", {
      error,
    });

    let failureReason = "An unknown error occurred during Run processing.";
    if (error instanceof Error) {
      failureReason = error.message;
    }

    await db
      .update(runs)
      .set({ status: "failed", failure_reason: failureReason })
      .where(and(eq(runs.id, run.id), eq(runs.cluster_id, run.clusterId)));

    throw error;
  }
};

function anonymize<T>(value: T): T {
  if (typeof value === "string") {
    return "<string>" as T;
  } else if (value === null) {
    return "<null>" as T;
  } else if (typeof value === "number") {
    return "<number>" as T;
  } else if (typeof value === "boolean") {
    return "<boolean>" as T;
  } else if (Array.isArray(value)) {
    return [anonymize(value[0])] as T;
  } else if (typeof value === "object") {
    const result = {} as T;
    for (const key in value) {
      result[key] = anonymize(value[key]);
    }
    return result;
  }

  return value;
}

const safeParse = (value: string | null) => {
  if (value === null) return null;

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

export const formatJobsContext = (
  jobs: { targetArgs: string | null; result: string | null }[],
  status: "success" | "failed"
) => {
  if (jobs.length === 0) return "";

  const jobEntries = jobs
    .map(
      job =>
        `<input>${JSON.stringify(anonymize(safeParse(job.targetArgs)))}</input><output>${JSON.stringify(anonymize(safeParse(job.result)))}</output>`
    )
    .join("\n");

  return `<previous_jobs status="${status}">\n${jobEntries}\n</previous_jobs>`;
};

async function findRelatedFunctionTools(
  run: {
    id: string;
    clusterId: string;
    modelIdentifier: ChatIdentifiers | null;
    resultSchema: unknown | null;
    debug: boolean;
  },
  search: string
) {
  const flags = await flagsmith?.getIdentityFlags(run.clusterId, {
    clusterId: run.clusterId,
  });

  const useKmeans = flags?.isFeatureEnabled("use_kmeans_clustering");

  const relatedToolsSearchResults = search
    ? await embeddableServiceFunction.findSimilarEntities(
        run.clusterId,
        "service-function",
        search,
        50 // limit to 50 results
      )
    : [];

  let relatedTools = relatedToolsSearchResults;

  if (useKmeans && relatedToolsSearchResults?.length > 30) {
    logger.info("Using kmeans clustering for related tool search");
    relatedTools = mostRelevantKMeansCluster(relatedToolsSearchResults);
  }

  const toolContexts = await Promise.all(
    relatedTools.map(async toolDetails => {
      const [resolvedJobs, rejectedJobs] = await Promise.all([
        getLatestJobsResultedByFunctionName({
          clusterId: run.clusterId,
          service: toolDetails.serviceName,
          functionName: toolDetails.functionName,
          limit: 3,
          resultType: "resolution",
        }).then(jobs => {
          return jobs?.map(j => ({
            targetArgs: anonymize(j.targetArgs),
            result: anonymize(j.result),
          }));
        }),
        getLatestJobsResultedByFunctionName({
          clusterId: run.clusterId,
          service: toolDetails.serviceName,
          functionName: toolDetails.functionName,
          limit: 3,
          resultType: "rejection",
        }).then(jobs => {
          return jobs?.map(j => ({
            targetArgs: anonymize(j.targetArgs),
            result: anonymize(j.result),
          }));
        }),
      ]);

      const contextArr: string[] = [];

      const successJobsContext = formatJobsContext(resolvedJobs, "success");
      if (successJobsContext) {
        contextArr.push(successJobsContext);
      }

      const failedJobsContext = formatJobsContext(rejectedJobs, "failed");
      if (failedJobsContext) {
        contextArr.push(failedJobsContext);
      }

      return {
        serviceName: toolDetails.serviceName,
        functionName: toolDetails.functionName,
        toolContext: contextArr.map(c => c.trim()).join("\n\n"),
      };
    })
  );

  const selectedTools = relatedTools.map(toolDetails =>
    buildAbstractServiceFunctionTool({
      ...toolDetails,
      description: [
        toolDetails.description,
        toolContexts.find(
          c =>
            c?.serviceName === toolDetails.serviceName &&
            c?.functionName === toolDetails.functionName
        )?.toolContext,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: toolDetails.schema,
    })
  );

  return selectedTools;
}

const buildAdditionalContext = async (run: {
  id: string;
  clusterId: string;
  systemPrompt: string | null;
}) => {
  let context = "";

  context += await getClusterContextText(run.clusterId);
  context += `\nCurrent Run URL: ${env.APP_ORIGIN}/clusters/${run.clusterId}/runs/${run.id}`;
  run.systemPrompt && (context += `\n${run.systemPrompt}`);

  return context;
};

export const buildMockTools = async (run: {
  id: string;
  clusterId: string;
  testMocks: Record<string, { output: Record<string, unknown> }> | null;
  test: boolean;
}) => {
  const mocks: Record<string, AgentTool> = {};
  if (!run.testMocks || Object.keys(run.testMocks).length === 0) {
    return mocks;
  }

  if (!run.test) {
    logger.warn("Run is not marked as test enabled but contains mocks. Mocks will be ignored.");
    return mocks;
  }

  const serviceDefinitions = await getServiceDefinitions({
    clusterId: run.clusterId,
  });

  for (const [key, value] of Object.entries(run.testMocks)) {
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

    const serviceDefinition = serviceDefinitions.find(sd => sd.service === serviceName);

    if (!serviceDefinition) {
      logger.warn("Service definition not found for mock. Mocks must refer to existing services.", {
        key,
        serviceName,
      });
      continue;
    }

    const functionDefinition = serviceDefinition.definition.functions?.find(
      f => f.name === functionName
    );

    if (!functionDefinition) {
      logger.warn(
        "Function definition not found for mock. Mocks must refer to existing functions.",
        {
          key,
          serviceName,
          functionName,
        }
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

export const generateRunName = async ({
  id,
  clusterId,
  content,
}: {
  id: string;
  clusterId: string;
  content: string;
}) => {
  const runName = await db
    .select({ name: runs.name })
    .from(runs)
    .where(eq(runs.id, id))
    .then(r => r[0]?.name);

  if (runName) {
    return;
  }

  const result = await generateTitle(content, {
    id,
    clusterId,
  });

  await db
    .update(runs)
    .set({ name: result.summary })
    .where(and(eq(runs.id, id), eq(runs.cluster_id, clusterId)));
};
