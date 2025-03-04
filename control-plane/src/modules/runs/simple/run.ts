import { and, eq } from "drizzle-orm";
import { db, runs } from "../../data";
import { logger } from "../../observability/logger";
import { onStatusChangeSchema } from "../../contract";
import { ChatIdentifiers } from "../../models/routing";
import { z } from "zod";
import { buildModel } from "../../models";
import { addAttributes } from "../../observability/tracer";
import {
  getRunMessages,
  insertRunMessage,
  toAnthropicMessages,
} from "../messages";
import { AgentError, RetryableError } from "../../../utilities/errors";
import { JsonSchemaInput, validateToolSchema } from "../../tools/validations";
import { Validator } from "jsonschema";
import { ulid } from "ulid";
import { notifyStatusChange } from "../notify";
import AsyncRetry from "async-retry";

const validator = new Validator();

export const processSimpleRun = async (run: {
  id: string;
  clusterId: string;
  modelIdentifier: ChatIdentifiers | null;
  resultSchema: unknown | null;
  type: "single-step" | "multi-step";
  debug: boolean;
  status: string;
  systemPrompt: string | null;
  onStatusChange: z.infer<typeof onStatusChangeSchema> | null;
  authContext: unknown | null;
  context: unknown | null;
}) => {
  logger.info("Processing Run", {
    type: run.type,
  });

  await db
    .update(runs)
    .set({ status: "running", failure_reason: "" })
    .where(eq(runs.id, run.id));

  const model = buildModel({
    identifier: run.modelIdentifier ?? "claude-3-5-sonnet",
    purpose: "agent_loop.reasoning",
    trackingOptions: {
      clusterId: run.clusterId,
      runId: run.id,
    },
  });

  addAttributes({
    "model.identifier": model.identifier,
  });

  const messages = await getRunMessages({
    clusterId: run.clusterId,
    runId: run.id,
  });

  if (run.debug) {
    addAttributes({
      "model.input.systemPrompt": run.systemPrompt ?? "",
      "model.input.messages": JSON.stringify(
        messages.map((m) => ({
          id: m.id,
          type: m.type,
        })),
      ),
    });
  }

  const schema = run.resultSchema ?? {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: [],
  };

  const resultSchemaErrors = validateToolSchema(schema as JsonSchemaInput);
  if (resultSchemaErrors.length > 0) {
    throw new AgentError("Result schema is not invalid JSONSchema");
  }

  const attempt = AsyncRetry(
    async () => {
      const response = await model.structured({
        messages: toAnthropicMessages(messages),
        system: run.systemPrompt ?? "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: schema as any,
      });

      if (!response) {
        throw new AgentError("Model call failed");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const validation = validator.validate(response.structured, schema as any);

      if (!validation.valid) {
        logger.warn("Model provided invalid response object", {
          errors: validation.errors,
          structured: response.structured,
          raw: response.raw,
        });

        const newMessages = [
          {
            id: ulid(),
            type: "agent-invalid" as const,
            data: {
              message: "Produced model output",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              details: response.raw as any,
            },
            runId: run.id,
            clusterId: run.clusterId,
            createdAt: new Date(),
          },
          {
            id: ulid(),
            type: "supervisor" as const,
            data: {
              message:
                "You provided an invalid output. Refer to the final_result_schema for the expected format. The validation errors are mentioned below.",
              details: { errors: validation.errors },
            },
            runId: run.id,
            clusterId: run.clusterId,
            createdAt: new Date(),
          },
        ];

        for (const message of newMessages) {
          await insertRunMessage(message);
        }

        throw new AgentError("Model provided invalid response object");
      }
      return response;
    },
    {
      retries: 5,
    },
  );

  try {
    const response = await attempt;

    await insertRunMessage({
      id: ulid(),
      type: "agent",
      data: {
        result: response.structured,
      },
      runId: run.id,
      clusterId: run.clusterId,
    });

    await db
      .update(runs)
      .set({ status: "done" })
      .where(and(eq(runs.id, run.id), eq(runs.cluster_id, run.clusterId)));

    await notifyStatusChange({
      run: {
        id: run.id,
        clusterId: run.clusterId,
        onStatusChange: run.onStatusChange,
        status: run.status,
        authContext: run.authContext,
        context: run.context,
      },
      status: "done",
      result: response.structured,
    });
  } catch (error) {
    let reason = "Unknown error";
    if (error instanceof Error) {
      reason = error.message;
    }
    await db
      .update(runs)
      .set({
        status: "failed",
        failure_reason: reason,
      })
      .where(and(eq(runs.id, run.id), eq(runs.cluster_id, run.clusterId)));

    await notifyStatusChange({
      run: {
        id: run.id,
        clusterId: run.clusterId,
        onStatusChange: run.onStatusChange,
        status: run.status,
        authContext: run.authContext,
        context: run.context,
      },
      status: "failed",
    });
  }
};
