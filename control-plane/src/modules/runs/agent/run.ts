import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getWaitingJobIds } from "../";
import { env } from "../../../utilities/env";
import { AgentError, NotFoundError } from "../../../utilities/errors";
import { onStatusChangeSchema } from "../../contract";
import { db, runs } from "../../data";
import { logger } from "../../observability/logger";
import { getRunMessages, insertRunMessage } from "../messages";
import { notifyStatusChange } from "../notify";
import { generateTitle } from "../summarization";
import { createRunGraph } from "./agent";
import { buildTool } from "./tools/functions";
import { getToolDefinition } from "../../tools";
import { RunGraphState } from "./state";
import { AgentTool } from "./tool";

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

  await db.update(runs).set({ status: "running", failure_reason: "" }).where(eq(runs.id, run.id));

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
    getTool: async toolCall => {
      if (!toolCall.id) {
        throw new Error("Can not return tool without call ID");
      }

      const tool = await getToolDefinition({
        name: toolCall.toolName,
        clusterId: run.clusterId,
      });

      if (!tool || run.attachedFunctions?.includes(toolCall.toolName) === false) {
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
    getAttachedTools: state => getAttachedTools(state),
    postStepSave: async state => {
      logger.debug("Saving run state", {
        runId: run.id,
        clusterId: run.clusterId,
      });

      // Insert messages in a loop to ensure they are created with differing timestamps
      for (const message of state.messages.filter(m => !m.persisted)) {
        await insertRunMessage(message);
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

const getAttachedTools = async (state: RunGraphState) => {
  const run = state.run;

  const tools: AgentTool[] = [];
  const attachedFunctions = run.attachedFunctions ?? [];

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

  return tools;
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
