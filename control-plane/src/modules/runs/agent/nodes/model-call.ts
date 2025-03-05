import { ReleventToolLookup } from "../agent";
import { toAnthropicMessage, toAnthropicMessages } from "../../messages";
import { logger } from "../../../observability/logger";
import { RunGraphState, RunGraphStateMessage } from "../state";
import { addAttributes, withSpan } from "../../../observability/tracer";
import { AgentError } from "../../../../utilities/errors";
import { ulid } from "ulid";

import { Model } from "../../../models";
import { ToolUseBlock } from "@anthropic-ai/sdk/resources";

import { Schema, Validator } from "jsonschema";
import { buildModelSchema, ModelOutput } from "./model-output";
import { FINAL_RESULT_SCHEMA_TAG_NAME, getSystemPrompt } from "./system-prompt";
import { handleContextWindowOverflow } from "../overflow";
import { validateFunctionSchema } from "inferable";
import { JsonSchemaInput } from "inferable/bin/types";

type RunStateUpdate = Partial<RunGraphState>;

export const MODEL_CALL_NODE_NAME = "model";

const validator = new Validator();
export const handleModelCall = (
  state: RunGraphState,
  model: Model,
  findRelevantTools: ReleventToolLookup,
) =>
  withSpan("run.modelCall", () =>
    _handleModelCall(state, model, findRelevantTools),
  );

/**
 * Attempts to rescue a structured result that is a string by parsing it as JSON.
 * Sometimes the Claude gets confused and returns a stringified JSON object, which doesn't get parsed by the Anthropic SDK.
 */
function attemptRescueStringifiedStructuredResult(response: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (response as any)?.structured;

  if ("result" in s && typeof s.result === "string") {
    try {
      const previous = s.result;
      s.result = JSON.parse(previous);
      logger.info("Rescued structured result from string", {
        previous,
        current: s.result,
      });
    } catch (e) {
      logger.warn(
        "Detected structured result is a string, trying to parse as JSON but failed",
        {
          error: e,
          structured: s,
        },
      );
    }
  }

  return s;
}

const _handleModelCall = async (
  state: RunGraphState,
  model: Model,
  findRelevantTools: ReleventToolLookup,
): Promise<RunStateUpdate> => {
  detectCycle(state.messages);

  const relevantTools = await findRelevantTools(state);

  addAttributes({
    "model.relevant_tools": relevantTools.map(tool => tool.name),
    "model.identifier": model.identifier,
  });

  if (!!state.run.resultSchema) {
    const resultSchemaErrors = validateFunctionSchema(
      state.run.resultSchema as JsonSchemaInput,
    );
    if (resultSchemaErrors.length > 0) {
      throw new AgentError("Result schema is not invalid JSONSchema");
    }
  }

  const schema = buildModelSchema({
    state,
    relevantSchemas: relevantTools,
    resultSchema: state.run.resultSchema as JsonSchemaInput,
  });

  const systemPrompt = getSystemPrompt(
    state,
    relevantTools,
    !!state.run.resultSchema,
  );

  const consolidatedSystemPrompt = [
    `<directives>`,
    systemPrompt,
    `</directives>`,
    `<${FINAL_RESULT_SCHEMA_TAG_NAME}>`,
    JSON.stringify(schema),
    `</${FINAL_RESULT_SCHEMA_TAG_NAME}>`,
  ]
    .filter(Boolean)
    .join("\n");

  const truncatedMessages = await handleContextWindowOverflow({
    messages: state.messages,
    systemPrompt: consolidatedSystemPrompt,
    modelContextWindow: model.contextWindow,
    render: m => JSON.stringify(toAnthropicMessage(m)),
  });

  if (state.run.debug) {
    addAttributes({
      "model.input.systemPrompt": systemPrompt,
      "model.input.messages": JSON.stringify(
        truncatedMessages.map(m => ({
          id: m.id,
          type: m.type,
        })),
      ),
    });
  }

  const response = await model.structured({
    messages: toAnthropicMessages(truncatedMessages),
    system: systemPrompt,
    schema,
  });

  if (!response) {
    throw new AgentError("Model call failed");
  }

  const toolCalls = response.raw.content
    .filter(m => m.type === "tool_use" && m.name !== "extract")
    .map(m => m as ToolUseBlock);

  attemptRescueStringifiedStructuredResult(response);

  const validation = validator.validate(response.structured, schema as Schema);

  const data = response.structured as ModelOutput;

  if (!validation.valid) {
    logger.warn("Model provided invalid response object", {
      errors: validation.errors,
      structured: response.structured,
      raw: response.raw,
    });
    return {
      messages: [
        {
          id: ulid(),
          type: "agent-invalid",
          data: {
            message: "Produced model output",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            details: response.raw as any,
          },
          runId: state.run.id,
          clusterId: state.run.clusterId,
          createdAt: new Date(),
        },
        {
          id: ulid(),
          type: "supervisor",
          data: {
            message:
              "You provided an invalid output. Refer to the final_result_schema for the expected format. The validation errors are mentioned below.",
            details: { errors: validation.errors },
          },
          runId: state.run.id,
          clusterId: state.run.clusterId,
          createdAt: new Date(),
        },
      ],
      status: "running",
    };
  }

  if (toolCalls.length > 0) {
    const invocations = toolCalls
      .map(call => {
        return {
          ...(state.run.reasoningTraces
            ? { reasoning: "Extracted from tool calls" }
            : {}),
          toolName: call.name,
          input: call.input,
          // This throws away the tool call id. This should be ok.
        };
      })
      .filter(Boolean);

    if (invocations && invocations.length > 0) {
      if (!data.invocations || !Array.isArray(data.invocations)) {
        data.invocations = [];
      }

      // Add them to the invocation array to be handled as if they were provided correctly
      data.invocations.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(invocations as any),
      );

      logger.info("Structured output attempted to call additional tools", {
        additional: invocations.map(call => call?.toolName),
      });
    }
  }

  if (state.run.debug) {
    addAttributes({
      "model.response": JSON.stringify(response),
    });
  }

  const hasInvocations = data.invocations && data.invocations.length > 0;

  if (state.run.debug && hasInvocations) {
    addAttributes({
      "model.invocations": data.invocations?.map(invoc =>
        JSON.stringify(invoc),
      ),
    });
  }

  // If the model signifies that it is done but provides more invocations, clear the result and continue to allow the invocations to resolve.
  if (data.done && hasInvocations) {
    logger.info("Model returned done and invocations, ignoring result", {
      data,
    });
    data.result = undefined;
    data.message = undefined;
    data.done = false;
  }

  // If the model signifies that it should continue but provides no invocations, prompt it to provide an invocation.
  if (!data.done && !hasInvocations) {
    logger.info("Model returned not done with no invocations", {
      data,
    });
    return {
      messages: [
        {
          id: ulid(),
          type: "agent-invalid",
          data: {
            message: "Invalid model response.",
            details: data,
          },
          runId: state.run.id,
          clusterId: state.run.clusterId,
          createdAt: new Date(),
        },
        {
          id: ulid(),
          type: "supervisor",
          data: {
            message:
              "If you are not done, please provide an invocation, otherwise return done.",
          },
          runId: state.run.id,
          clusterId: state.run.clusterId,
          createdAt: new Date(),
        },
      ],
      status: "running",
    };
  }

  // If the model signifies that it is done but provides no result, prompt it to provide a result.
  if (data.done && !data.result && !data.message) {
    logger.info("Model returned done with no result", {
      data,
    });
    return {
      messages: [
        {
          id: ulid(),
          type: "agent-invalid",
          data: {
            message: "Produced model output",
            details: data,
          },
          runId: state.run.id,
          clusterId: state.run.clusterId,
          createdAt: new Date(),
        },
        {
          id: ulid(),
          type: "supervisor",
          data: {
            message: `Please provide a final result before stopping. Refer to the ${FINAL_RESULT_SCHEMA_TAG_NAME} for the expected format. If you have insufficient information to provide a result, please provide a message describing why you can't provide a result.`,
          },
          runId: state.run.id,
          clusterId: state.run.clusterId,
          createdAt: new Date(),
        },
      ],
      status: "running",
    };
  }

  return {
    messages: [
      {
        id: ulid(),
        type: "agent",
        data: {
          invocations: data.invocations?.map((invocation: any) => ({
            ...invocation,
            id: ulid(),
            reasoning: invocation.reasoning as string | undefined,
          })),
          issue: data.issue,
          result: data.result,
          message: typeof data.message === "string" ? data.message : undefined,
        },
        runId: state.run.id,
        clusterId: state.run.clusterId,
        createdAt: new Date(),
      },
    ],
    status: data.done ? "done" : "running",
    result: data.result,
  };
};

const detectCycle = (messages: RunGraphStateMessage[]) => {
  if (messages.length >= 100) {
    throw new AgentError("Maximum Run message length exceeded.");
  }

  // If the last 10 messages don't include a call, result or human message, assume it's a cycle
  if (messages.length >= 10) {
    const lastMessages = messages.slice(-10);
    if (
      !lastMessages.some(
        m => m.type === "invocation-result" || m.type === "human",
      )
    ) {
      throw new AgentError("Detected cycle in Run.");
    }
  }
};
