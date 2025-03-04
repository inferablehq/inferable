import { z } from "zod";
import { logger } from "../observability/logger";
import { RetryableError } from "../../utilities/errors";
import { buildModel } from "../models";
import { zodToJsonSchema } from "zod-to-json-schema";

export const generateTitle = async (
  message: string,
  run: {
    id: string;
    clusterId: string;
  },
  words: number = 10,
): Promise<{ summary: string }> => {
  const system = [
    `You are a title generation assistant that is capable of succintly summarizing a set of messages in a single sentence. The title should be no more than ${words} words. Generate title for the following messages. Use identifying information such as names, dates, and locations if necessary. Good examples:
      - Ticket information for Bob
      - Refund request for Alice
      - List of capabilites for the assistant
      Bad examples:
      - I am capable of generating titles for messages`,
  ].join("\n");

  const schema = z.object({
    summary: z.string(),
  });

  const model = buildModel({
    identifier: "claude-3-haiku",
    purpose: "agent_loop.generate_title",
    trackingOptions: {
      clusterId: run.clusterId,
      runId: run.id,
    },
  });

  const response = await model.structured({
    system,
    messages: [
      {
        role: "user",
        content: message,
      },
    ],
    schema: zodToJsonSchema(schema),
  });

  const parsed = schema.safeParse(response.structured);

  if (!parsed.success) {
    logger.error("Model did not return valid output", {
      errors: parsed.error.issues,
    });

    throw new RetryableError("Invalid title output from model");
  }

  return parsed.data;
};
