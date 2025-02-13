import { logger } from "../../observability/logger";
import { estimateTokenCount } from "./utils";
import * as events from "../../observability/events";
import { buildModel } from "../../models";

const MAX_RESULT_CHAR_COUNT = 10_000;
export const SUMMARIZER_TOOL_NAME = "summarizer";

export const needsSummarizing = (obj: unknown) => {
  if (typeof obj === "string") {
    return obj.length > MAX_RESULT_CHAR_COUNT;
  }

  if (!obj) {
    return false;
  }

  return JSON.stringify(obj).length > MAX_RESULT_CHAR_COUNT;
};

export const summariseJobResultIfNecessary = async (input: {
  result: unknown;
  invocationPurpose?: string;
  clusterId: string;
  runId: string;
  targetFn: string;
}): Promise<
  | {
      summary: string;
      originalResultSize: number;
      summarySize: number;
    }
  | unknown
> => {
  if (!needsSummarizing(input.result)) {
    return input.result;
  }

  logger.info(`Summarizing result because it is too large.`, {
    clusterId: input.clusterId,
    runId: input.runId,
    targetFn: input.targetFn,
  });

  const model = buildModel({
    identifier: "claude-3-haiku",
    trackingOptions: {
      clusterId: input.clusterId,
      runId: input.runId,
    },
    purpose: "agent_loop.summarize_result",
  });

  try {
    const result = await model.call({
      messages: [
        {
          role: "user",
          content: `
This following is a json result from a job.

Summarize the result in a way that it preserves the most important information${
            input.invocationPurpose
              ? ` for the purpose of ${input.invocationPurpose}.`
              : "."
          }

<JOB_RESULT>
${JSON.stringify(input.result)}
</JOB_RESULT>
`,
        },
      ],
    });

    const content = result.raw.content.pop();

    if (
      !content ||
      result.raw.content.length !== 0 ||
      content.type !== "text"
    ) {
      throw new Error("Unexpected content blocks in response");
    }

    const summary = content.text;

    return {
      summary,
      originalResultSize: await estimateTokenCount(
        JSON.stringify(input.result),
      ),
      summarySize: await estimateTokenCount(summary),
    };
  } catch (e) {
    logger.error("Error summarizing result", {
      error: e,
    });
    throw e;
  }
};
