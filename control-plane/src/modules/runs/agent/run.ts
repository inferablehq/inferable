import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getWaitingJobIds } from "../";
import { env } from "../../../utilities/env";
import { AgentError } from "../../../utilities/errors";
import { getClusterContextText } from "../../cluster";
import { onStatusChangeSchema } from "../../contract";
import { db, runs } from "../../data";
import { embedSearchQuery } from "../../embeddings/embeddings";
import { ChatIdentifiers } from "../../models/routing";
import { logger } from "../../observability/logger";
import { getRunMessages, insertRunMessage } from "../messages";
import { notifyNewRunMessage, notifyStatusChange } from "../notify";
import { generateTitle } from "../summarization";
import { createRunGraph } from "./agent";
import { findRelevantTools } from "./tool-search";
import { buildTool } from "./tools/functions";
import { availableTools, getToolDefinition } from "../../tools";

/**
 * Run a Run from the most recent saved state
 **/
export const processAgentRun = async (
  run: {
    id: string;
    clusterId: string;
    resultSchema: unknown | null;
    debug: boolean;
    attachedFunctions: string[] | null;
    status: string;
    systemPrompt: string | null;
    testMocks: Record<string, { output: Record<string, unknown> }> | null;
    type: "single-step" | "multi-step";
    test: boolean;
    reasoningTraces: boolean;
    enableResultGrounding: boolean;
    onStatusChange: z.infer<typeof onStatusChangeSchema> | null;
    authContext: unknown | null;
    context: unknown | null;
    providerUrl?: string | null;
    providerModel?: string | null;
    providerKey?: string | null;
  },
  tags?: Record<string, string>,
  mockModelResponses?: string[]
  // Deprecated, to be removed once all SDKs are updated
) => {
  logger.info("Processing Run", {
    type: run.type,
  });

  // Parallelize fetching additional context and service definitions
  const [
    additionalContext,
    toolNames,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _updateResult,
  ] = await Promise.all([
    buildAdditionalContext(run),
    availableTools({ clusterId: run.clusterId }),
    db.update(runs).set({ status: "running", failure_reason: "" }).where(eq(runs.id, run.id)),
  ]);

  const allAvailableTools: string[] = [];
  const attachedFunctions = run.attachedFunctions ?? [];

  allAvailableTools.push(...attachedFunctions);

  allAvailableTools.push(...toolNames);

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
    run,
    mockModelResponses,
    allAvailableTools,
    additionalContext,
    getTool: async toolCall => {
      if (!toolCall.id) {
        throw new Error("Can not return tool without call ID");
      }

      const tool = await getToolDefinition({
        name: toolCall.toolName,
        clusterId: run.clusterId,
      });

      if (!tool) {
        throw new AgentError(`Definition for tool not found: ${toolCall.toolName}`);
      }

      return buildTool({
        name: toolCall.toolName,
        toolCallId: toolCall.id!,
        run: run,
        schema: tool.schema ?? undefined,
        description: tool.description ?? undefined,
      });
    },
    findRelevantTools: state => findRelevantTools(state),
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
        await Promise.allSettled([insertRunMessage(message), notifyNewRunMessage({ message, tags })]);
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
