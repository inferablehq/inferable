import { JsonSchema7ObjectType } from "zod-to-json-schema";
import { AgentTool } from "../tool";
import { runs } from "../../../data";
import { InferSelectModel } from "drizzle-orm";
import { RunGraphState } from "../state";

type ModelInvocationOutput = {
  toolName: string;
  input: unknown;
};

export type ModelOutput = {
  invocations?: ModelInvocationOutput[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  message?: string;
  done?: boolean;
  issue?: string;
};

export const buildModelSchema = ({
  state,
  relevantSchemas,
  resultSchema,
}: {
  state: RunGraphState;
  relevantSchemas: AgentTool[];
  resultSchema?: InferSelectModel<typeof runs>["result_schema"];
}) => {
  // Build the toolName enum
  const toolNameEnum = [...relevantSchemas.map(tool => tool.name)];

  const schema: JsonSchema7ObjectType = {
    type: "object",
    additionalProperties: false,
    properties: {
      done: {
        type: "boolean",
        description:
          "Whether the workflow is done. All tasks have been completed or you can not progress further.",
      },
      issue: {
        type: "string",
        description:
          "Describe any issues you have encountered in this step. Specifically related to the tools you are using. If none, keep this field empty.",
      },
    },
  };

  if (resultSchema) {
    schema.properties.result = {
      ...resultSchema,
      description:
        "The final result of the workflow, only provided once all tasks have been completed. Pay special attention to the structure of this property as it is strongly enforced.",
    };
  } else {
    schema.properties.message = {
      type: "string",
      description: "A message describing the current state or next steps.",
    };
    schema.properties.result = {
      type: "object",
      description:
        "The final result of the workflow, only provided once all tasks have been completed.",
    };
  }

  const invocationItemProperties: JsonSchema7ObjectType["properties"] = {
    toolName: {
      type: "string",
      enum: toolNameEnum,
    },
    input: {
      type: "object",
      additionalProperties: true,
      description: "Arbitrary input parameters for the tool call.",
    },
  };

  if (state.run.reasoningTraces) {
    invocationItemProperties.reasoning = {
      type: "string",
      description: "Reasoning trace for why this tool call is made.",
    };
  }

  schema.properties.invocations = {
    type: "array",
    description:
      "Any tool calls you need to make. If multiple are provided, they will be executed in parallel. DO NOT describe previous tool calls.",
    items: {
      type: "object",
      additionalProperties: false,
      properties: invocationItemProperties,
      required: ["toolName", "input"],
    },
  };

  return schema;
};
