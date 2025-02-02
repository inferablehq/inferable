import { ulid } from "ulid";
import { flagsmith } from "../../flagsmith";
import { getLatestJobsResultedByFunctionName } from "../../jobs/jobs";
import { buildModel } from "../../models";
import { ChatIdentifiers } from "../../models/routing";
import { events } from "../../observability/events";
import { logger } from "../../observability/logger";
import { embeddableServiceFunction } from "../../service-definitions";
import { toAnthropicMessage } from "../messages";
import { RunGraphState } from "./state";
import { AgentTool } from "./tool";
import { buildAbstractServiceFunctionTool } from "./tools/functions";
import { availableStdlib } from "./tools/stdlib";
import { z } from "zod";

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

const safeParse = (value: string | null) => {
  if (value === null) return null;

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

export const getToolContexts = async ({
  clusterId,
  relatedTools,
}: {
  clusterId: string;
  relatedTools: {
    serviceName: string;
    functionName: string;
  }[];
}) => {
  const toolContexts = await Promise.all(
    relatedTools.map(async toolDetails => {
      const [resolvedJobs, rejectedJobs] = await Promise.all([
        getLatestJobsResultedByFunctionName({
          clusterId,
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
          clusterId,
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

  return toolContexts;
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
  const relatedTools = search
    ? await embeddableServiceFunction.findSimilarEntities(
        run.clusterId,
        "service-function",
        search,
        50 // limit to 50 results
      )
    : [];

  const selectedTools = relatedTools.map(toolDetails =>
    buildAbstractServiceFunctionTool({
      ...toolDetails,
      description: toolDetails.description,
      schema: toolDetails.schema,
    })
  );

  return selectedTools;
}

export const findRelevantTools = async (state: RunGraphState) => {
  const start = Date.now();
  const run = state.run;

  const tools: AgentTool[] = [];
  const attachedFunctions = run.attachedFunctions ?? [];

  const stdlib = availableStdlib();

  // If functions are explicitly attached, skip relevant tools search
  if (attachedFunctions.length > 0) {
    for (const tool of attachedFunctions) {
      if (tool.toLowerCase().startsWith("inferable_")) {
        const internalToolName = tool.split("_")[1];

        if (internalToolName === stdlib.calculator.metadata.name) {
          tools.push(stdlib.calculator);
          continue;
        } else if (internalToolName === stdlib.currentDateTime.metadata.name) {
          tools.push(stdlib.currentDateTime);
          continue;
        } else if (internalToolName === stdlib.getUrl.metadata.name) {
          tools.push(stdlib.getUrl);
          continue;
        } else {
          logger.warn("Tool not found in stdlib", {
            tool,
          });

          throw new Error(`Tool ${tool} not found in cluster ${run.clusterId}`);
        }
      }

      const serviceFunctionDetails = await embeddableServiceFunction.getEntity(
        run.clusterId,
        "service-function",
        tool
      );

      if (!serviceFunctionDetails) {
        throw new Error(`Tool ${tool} not found in cluster ${run.clusterId}`);
      }

      tools.push(
        buildAbstractServiceFunctionTool({
          ...serviceFunctionDetails,
          schema: serviceFunctionDetails.schema,
        })
      );
    }
  } else {
    const model = buildModel({
      purpose: "agent.tool-search-query",
      identifier: "claude-3-5-sonnet",
      modelOptions: {
        temperature: 0.2,
      },
      trackingOptions: {
        clusterId: run.clusterId,
        runId: run.id,
      },
    });

    const searchQuery = await model.call({
      maxTokens: 100,
      system:
        "You are a helpful assistant. You are give a message history conducted by an agent X. Agent X has requested your help in generating a plain text search query to find relevant tools to call. The search query should be a at most 2 sentences.",
      messages: [
        toAnthropicMessage({
          type: "human",
          id: ulid(),
          data: {
            message: ["Here is the system prompt for Agent X:", run.systemPrompt ?? "(empty)"].join(
              "\n"
            ),
          },
        }),
        toAnthropicMessage({
          type: "agent",
          id: ulid(),
          data: {
            message: "Acknowledged. Give me the message history conducted by Agent X.",
          },
        }),
        toAnthropicMessage({
          type: "human",
          id: ulid(),
          data: {
            message: [
              "Here is the message history conducted by Agent X:",
              ...state.messages.map(m => JSON.stringify(m.data)),
            ].join("\n"),
          },
        }),
        toAnthropicMessage({
          type: "agent",
          id: ulid(),
          data: {
            message: "Acknowledged. I have thought deeply, and you must search for tools that can:",
          },
        }),
      ],
    });

    const searchQueryContent = z
      .object({
        type: z.literal("text"),
        text: z.string(),
      })
      .safeParse(searchQuery.raw.content[0]);

    if (!searchQueryContent.success) {
      logger.warn("Failed to parse search query. Will use message history instead.", {
        searchQuery,
      });
    }

    const found = await findRelatedFunctionTools(
      run,
      searchQueryContent.success
        ? searchQueryContent.data.text
        : state.messages
            .map(m => JSON.stringify(m.data))
            .concat(run.systemPrompt ?? "")
            .join("\n")
    );

    tools.push(...found);

    tools.push(...Object.values(availableStdlib()));

    events.write({
      type: "functionRegistrySearchCompleted",
      workflowId: run.id,
      clusterId: run.clusterId,
      meta: {
        query: searchQueryContent.success ? searchQueryContent.data.text : "(message history)",
        tools: tools.map(t => t.name),
        duration: Date.now() - start,
      },
    });
  }

  return tools;
};
