import { ReleventToolLookup } from "../agent";
import { toAnthropicMessages } from "../../workflow-messages";
import { logger } from "../../../observability/logger";
import { WorkflowAgentState, WorkflowAgentStateMessage } from "../state";
import {
  addAttributes,
  withSpan,
} from "../../../observability/tracer";
import { AgentError } from "../../../../utilities/errors";
import { z } from "zod";
import { ulid } from "ulid";

import { deserializeFunctionSchema } from "../../../service-definitions";
import { validateFunctionSchema } from "inferable";
import { JsonSchemaInput } from "inferable/bin/types";
import { Model } from "../../../models";
import { ToolUseBlock } from "@anthropic-ai/sdk/resources";

type WorkflowStateUpdate = Partial<WorkflowAgentState>;

export const MODEL_CALL_NODE_NAME = "model";

export const handleModelCall = (
  state: WorkflowAgentState,
  model: Model,
  findRelevantTools: ReleventToolLookup,
) =>
  withSpan("workflow.modelCall", () =>
    _handleModelCall(state, model, findRelevantTools),
  );

const _handleModelCall = async (
  state: WorkflowAgentState,
  model: Model,
  findRelevantTools: ReleventToolLookup,
): Promise<WorkflowStateUpdate> => {
  detectCycle(state.messages);
  const relevantSchemas = await findRelevantTools(state);

  addAttributes({
    "model.relevant_tools": relevantSchemas.map((tool) => tool.name),
    "model.available_tools": state.allAvailableTools,
    "model.identifier": model.identifier,
  });

  const renderedMessages = toAnthropicMessages(state.messages);

  if (!!state.workflow.resultSchema) {
    const resultSchemaErrors = validateFunctionSchema(
      state.workflow.resultSchema as JsonSchemaInput,
    );
    if (resultSchemaErrors.length > 0) {
      throw new AgentError("Result schema is not invalid JSONSchema");
    }
  }

  const resultSchema = state.workflow.resultSchema
    ? deserializeFunctionSchema(state.workflow.resultSchema)
    : null;

  const modelSchema = z
    .object({
      done: z
        .boolean()
        .describe(
          "Whether the workflow is done. All tasks have been completed or you can not progress further.",
        )
        .optional(),

      // If we have a result schema, specify it as the result output
      ...(!!resultSchema
        ? {
            result: resultSchema
              .optional()
              .describe(
                "Structrued object describing The final result of the workflow, only provided once all tasks have been completed.",
              ),
          }
        : {}),

      // Otherwise request a string message
      ...(!resultSchema
        ? {
            message: z.string().optional(),
          }
        : {}),

      issue: z
        .string()
        .describe(
          "Describe any issues you have encountered in this step. Specifically related to the tools you are using.",
        )
        .optional(),

      invocations: z
        .array(
          z.object({
            // @ts-expect-error: We don't care about the type information here, but we want to constrain the model's `toolName` choices.
            toolName: z.enum([
              ...relevantSchemas.map((tool) => tool.name),
              ...state.allAvailableTools,
            ] as string[] as const),
            ...(state.workflow.reasoningTraces
              ? { reasoning: z.string() }
              : {}),
            input: z.object({}).passthrough(),
          }),
        )
        .optional()
        .describe(
          "Any tools calls you need to make. If multiple are provided, they will be executed in parallel (Do this where possible). DO NOT describe previous tool calls.",
        ),
    })
    .strict();

  const schemaString = relevantSchemas.map((tool) => {
    return `${tool.name} - ${tool.description} ${tool.schema}`;
  });

  const systemPrompt = [
    "You are a helpful assistant with access to a set of tools designed to assist in completing tasks.",
    "You do not respond to greetings or small talk, and instead, you return 'done'.",
    "Use the tools at your disposal to achieve the task requested.",
    "If you cannot complete a task with the given tools, return 'done' and explain the issue clearly.",
    "If there is nothing left to do, return 'done' and provide the final result.",
    "If you encounter invocation errors (e.g., incorrect tool name, missing input), retry based on the error message.",
    "When possible, return multiple invocations to trigger them in parallel.",
    "Once all tasks have been completed, return the final result as a structured object.",
    "Provide concise and clear responses. Use **bold** to highlight important words.",
    state.additionalContext,
    "<TOOLS_SCHEMAS>",
    schemaString,
    "</TOOLS_SCHEMAS>",
    "<OTHER_AVAILABLE_TOOLS>",
    ...state.allAvailableTools.filter(
      (t) => !relevantSchemas.find((s) => s.name === t),
    ),
    "</OTHER_AVAILABLE_TOOLS>",
  ].join(" ");

  if (state.workflow.debug) {
    addAttributes({
      "model.input.additional_context": state.additionalContext,
      "model.input.messages": JSON.stringify(
        state.messages.map((m) => ({
          id: m.id,
          type: m.type,
        })),
      ),
      "model.input.rendered_messages": JSON.stringify(renderedMessages),
    });
  }

  const response = await model.structured({
    messages: renderedMessages,
    system: systemPrompt,
    schema: modelSchema,
  });

  if (!response) {
    throw new AgentError("Model call failed");
  }

  const toolCalls = response.raw.content
    .filter((m) => m.type === "tool_use" && m.name !== "extract")
    .map((m) => m as ToolUseBlock);

  const parsed = response.parsed;

  if (!parsed.success) {
    logger.info("Model provided invalid response object", {
      error: parsed.error,
    });
    return {
      messages: [
        {
          id: ulid(),
          type: "agent-invalid",
          data: {
            message: "Invalid model response.",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            details: response.raw as any,
          },
          runId: state.workflow.id,
          clusterId: state.workflow.clusterId,
        },
        {
          id: ulid(),
          type: "supervisor",
          data: {
            message: "Provided object was invalid, check your input",
            details: { errors: parsed.error.errors },
          },
          runId: state.workflow.id,
          clusterId: state.workflow.clusterId,
        },
      ],
      status: "running",
    };
  }

  if (toolCalls.length > 0) {
    const invocations = toolCalls
      .map((call) => {
        return {
          ...(state.workflow.reasoningTraces
            ? { reasoning: "Extracted from tool calls" }
            : {}),
          toolName: call.name,
          input: call.input,
          // This throws away the tool call id. This should be ok.
        };
      })
      .filter(Boolean);

    if (invocations && invocations.length > 0) {
      if (!parsed.data.invocations || !Array.isArray(parsed.data.invocations)) {
        parsed.data.invocations = [];
      }

      // Add them to the invocation array to be handled as if they were provided correctly
      parsed.data.invocations.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(invocations as any),
      );

      logger.info("Structured output attempted to call additional tools", {
        additional: invocations.map((call) => call?.toolName),
      });
    }
  }

  if (state.workflow.debug) {
    addAttributes({
      "model.response": JSON.stringify(response),
    });
  }

  const data = parsed.data;
  const hasInvocations = data.invocations && data.invocations.length > 0;

  if (state.workflow.debug && hasInvocations) {
    addAttributes({
      "model.invocations": data.invocations?.map((invoc) =>
        JSON.stringify(invoc),
      ),
    });
  }

  // If the model signifies that it is done but provides more invocations, clear the result and continue to allow the invocations to resolve.
  if (data.done && hasInvocations) {
    logger.info("Model returned done and invocations, ignoring result");
    data.result = undefined;
    data.message = undefined;
    data.done = false;
  }

  // If the model signifies that it should continue but provides no invocations, prompt it to provide an invocation.
  if (!data.done && !hasInvocations) {
    logger.info("Model returned not done with no invocations");
    return {
      messages: [
        {
          id: ulid(),
          type: "agent-invalid",
          data: {
            message: "Invalid model response.",
            details: data,
          },
          runId: state.workflow.id,
          clusterId: state.workflow.clusterId,
        },
        {
          id: ulid(),
          type: "supervisor",
          data: {
            message:
              "If you are not done, please provide an invocation, otherwise return done.",
          },
          runId: state.workflow.id,
          clusterId: state.workflow.clusterId,
        },
      ],
      status: "running",
    };
  }

  // If the model signifies that it is done but provides no result, prompt it to provide a result.
  if (data.done && !data.result && !data.message) {
    logger.info("Model returned done with no result");
    return {
      messages: [
        {
          id: ulid(),
          type: "agent-invalid",
          data: {
            message: "Invalid model response.",
            details: data,
          },
          runId: state.workflow.id,
          clusterId: state.workflow.clusterId,
        },
        {
          id: ulid(),
          type: "supervisor",
          data: {
            message: "Please provide a final result or a reason for stopping.",
          },
          runId: state.workflow.id,
          clusterId: state.workflow.clusterId,
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
          invocations: data.invocations?.map((invocation) => ({
            ...invocation,
            id: ulid(),
            reasoning: invocation.reasoning as string | undefined,
          })),
          issue: data.issue,
          result: data.result,
          message: typeof data.message === "string" ? data.message : undefined,
        },
        runId: state.workflow.id,
        clusterId: state.workflow.clusterId,
      },
    ],
    status: data.done ? "done" : "running",
    result: data.result,
  };
};

const detectCycle = (messages: WorkflowAgentStateMessage[]) => {
  if (messages.length >= 100) {
    throw new AgentError("Maximum workflow message length exceeded.");
  }

  // If the last 10 messages don't include a call, result or human message, assume it's a cycle
  if (messages.length >= 10) {
    const lastMessages = messages.slice(-10);
    if (
      !lastMessages.some(
        (m) => m.type === "invocation-result" || m.type === "human",
      )
    ) {
      throw new AgentError("Detected cycle in workflow.");
    }
  }
};
