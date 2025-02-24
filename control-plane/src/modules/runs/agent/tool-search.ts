import { ulid } from "ulid";
import { getLatestJobsResultedByFunctionName } from "../../jobs/jobs";
import { buildModel } from "../../models";
import { ChatIdentifiers } from "../../models/routing";
import { events } from "../../observability/events";
import { logger } from "../../observability/logger";
import { toAnthropicMessage } from "../messages";
import { RunGraphState } from "./state";
import { AgentTool } from "./tool";
import { z } from "zod";
import { getToolDefinition, searchTools } from "../../tools";
import { NotFoundError } from "../../../utilities/errors";

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
    functionName: string;
  }[];
}) => {
  const toolContexts = await Promise.all(
    relatedTools.map(async toolDetails => {
      const [resolvedJobs, rejectedJobs] = await Promise.all([
        getLatestJobsResultedByFunctionName({
          clusterId,
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
  const relatedTools = await searchTools({
    query: search,
    clusterId: run.clusterId,
  });

  const selectedTools = relatedTools
  .filter(definition => !definition.config?.private)
  .map(
    definition =>
      new AgentTool({
        name: definition.name,
        description: (definition.description ?? `${definition.name} function`).substring(0, 1024),
        schema: definition.schema ?? undefined,
        func: async () => undefined,
      })
  );

  return {
    selectedTools,
    relatedTools,
  };
}

export const findRelevantTools = async (state: RunGraphState) => {
  const start = Date.now();
  const run = state.run;

  const tools: AgentTool[] = [];
  const attachedFunctions = run.attachedFunctions ?? [];

  // If functions are explicitly attached, skip relevant tools search
  if (attachedFunctions.length > 0) {
    for (const tool of attachedFunctions) {
      const definition = await getToolDefinition({
        name: tool,
        clusterId: run.clusterId,
      });

      if (!definition) {
        throw new NotFoundError(`Tool ${tool} not found in cluster ${run.clusterId}`);
      }

      tools.push(
        new AgentTool({
          name: definition.name,
          description: (definition.description ?? `${definition.name} function`).substring(0, 1024),
          schema: definition.schema ?? undefined,
          func: async () => undefined,
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

    const { selectedTools } = await findRelatedFunctionTools(
      run,
      searchQueryContent.success
        ? searchQueryContent.data.text
        : state.messages
            .map(m => JSON.stringify(m.data))
            .concat(run.systemPrompt ?? "")
            .join("\n")
    );

    tools.push(...selectedTools);

    events.write({
      type: "toolSearchCompleted",
      runId: run.id,
      clusterId: run.clusterId,
      meta: {
        query: searchQueryContent.success ? searchQueryContent.data.text : "(message history)",
        tools: tools.map(t => {
          return {
            name: t.name,
            description: t.description,
          };
        }),
        duration: Date.now() - start,
      },
    });
  }

  return tools;
};
