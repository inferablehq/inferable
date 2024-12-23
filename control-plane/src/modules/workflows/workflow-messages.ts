import assert from "assert";
import { InferSelectModel, and, asc, desc, eq, gt, ne } from "drizzle-orm";
import { Auth, ClerkAuth } from "../auth/auth";
import { db, RunMessageMetadata, workflowMessages } from "../data";
import { deleteJobsAfter } from "../jobs/jobs";
import { resumeRun } from "./workflows";
import { z } from "zod";
import {
  agentDataSchema,
  genericMessageDataSchema,
  messageDataSchema,
  resultDataSchema,
} from "../contract";
import { logger } from "../observability/logger";
import Anthropic from "@anthropic-ai/sdk";
import { get, reduce } from "lodash";

export type MessageData = z.infer<typeof messageDataSchema>;

export type TypedMessage =
  | AgentMessage
  | InvocationResultMessage
  | GenericMessage;

/**
 * A structured response from the agent.
 */
export type AgentMessage = {
  data: z.infer<typeof agentDataSchema>;
  type: "agent";
};

/**
 * The result of a tool call.
 */
export type InvocationResultMessage = {
  data: z.infer<typeof resultDataSchema>;
  type: "invocation-result";
};

/**
 * A generic message container.
 */
export type GenericMessage = {
  data: z.infer<typeof genericMessageDataSchema>;
  type: "human" | "template" | "supervisor" | "agent-invalid";
};

export type RunMessage = {
  id: string;
  data: InferSelectModel<typeof workflowMessages>["data"];
  type: InferSelectModel<typeof workflowMessages>["type"];
  clusterId: string;
  runId: string;
  createdAt: Date;
  updatedAt?: Date | null;
} & TypedMessage;

export const insertRunMessage = async ({
  clusterId,
  user,
  runId,
  id,
  type,
  data,
}: {
  id: string;
  user?: ClerkAuth;
  clusterId: string;
  runId: string;
  type: InferSelectModel<typeof workflowMessages>["type"];
  data: InferSelectModel<typeof workflowMessages>["data"];
}) => {
  validateMessage({ data, type });
  await db
    .insert(workflowMessages)
    .values({
      id,
      user_id: user?.entityId ?? "SYSTEM",
      cluster_id: clusterId,
      workflow_id: runId,
      type,
      data,
    })
    .onConflictDoNothing();
};

export const upsertRunMessage = async ({
  user,
  clusterId,
  runId,
  id,
  type,
  data,
  metadata,
}: {
  user?: Auth;
  id: string;
  clusterId: string;
  runId: string;
  type: InferSelectModel<typeof workflowMessages>["type"];
  data: InferSelectModel<typeof workflowMessages>["data"];
  metadata?: RunMessageMetadata;
}) => {
  validateMessage({ data, type });

  const result = await db
    .insert(workflowMessages)
    .values([
      {
        id,
        user_id: user?.entityId ?? "SYSTEM",
        cluster_id: clusterId,
        workflow_id: runId,
        type,
        data,
        metadata,
      },
    ])
    .onConflictDoUpdate({
      where: and(
        eq(workflowMessages.cluster_id, clusterId),
        eq(workflowMessages.workflow_id, runId),
        eq(workflowMessages.id, id),
        eq(workflowMessages.type, type),
      ),
      target: [
        workflowMessages.cluster_id,
        workflowMessages.workflow_id,
        workflowMessages.id,
      ],
      set: {
        data,
        updated_at: new Date(),
        metadata,
        user_id: user?.entityId ?? "SYSTEM",
      },
    })
    .returning({
      id: workflowMessages.id,
      type: workflowMessages.type,
      data: workflowMessages.data,
    });

  assert(result.length === 1, "Expected one result");

  return result;
};

export const editHumanMessage = async ({
  clusterId,
  runId,
  user,
  message,
  id,
}: {
  clusterId: string;
  user?: Auth;
  runId: string;
  message: string;
  id: string;
}) => {
  const [upserted] = await upsertRunMessage({
    clusterId,
    user,
    runId,
    data: {
      message,
    },
    type: "human",
    id,
  });

  // delete all messages after the human message
  const deleted = await prepMessagesForRetry({
    clusterId,
    runId,
    messageId: id,
  });

  await resumeRun({
    clusterId,
    id: runId,
  });

  return {
    upserted,
    deleted,
  };
};

export const prepMessagesForRetry = async ({
  clusterId,
  runId,
  messageId,
}: {
  clusterId: string;
  runId: string;
  messageId: string;
}) => {
  const deleted = await Promise.all([
    db
      .delete(workflowMessages)
      .where(
        and(
          gt(workflowMessages.id, messageId),
          eq(workflowMessages.cluster_id, clusterId),
          eq(workflowMessages.workflow_id, runId),
        ),
      )
      .returning({
        id: workflowMessages.id,
      }),
    deleteJobsAfter({
      runId,
      clusterId,
      messageId,
    }),
  ]);

  return {
    deleted: deleted.flat().map((d) => d.id),
  };
};

export const getRunMessagesForDisplay = async ({
  clusterId,
  runId,
  last = 50,
  after = "0",
}: {
  clusterId: string;
  runId: string;
  last?: number;
  after?: string;
}) => {
  const messages = await db
    .select({
      id: workflowMessages.id,
      data: workflowMessages.data,
      type: workflowMessages.type,
      createdAt: workflowMessages.created_at,
      metadata: workflowMessages.metadata,
      displayableContext: workflowMessages.metadata,
    })
    .from(workflowMessages)
    .orderBy(desc(workflowMessages.created_at))
    .where(
      and(
        eq(workflowMessages.cluster_id, clusterId),
        eq(workflowMessages.workflow_id, runId),
        gt(workflowMessages.id, after),
        ne(workflowMessages.type, "agent-invalid"),
        ne(workflowMessages.type, "supervisor"),
        ne(workflowMessages.type, "result" as any),
      ),
    )
    .limit(last);

  const results = messages
    .filter((m) => m.type === "invocation-result")
    .map((m: any) => m.data.result); // TODO: fix type

  const allTokenized = results.reduce((acc, result) => {
    return { ...acc, ...result };
  }, {});

  for (const message of messages) {
    if (message.type === "agent") {
      if ("message" in message.data) {
        message.data.message = message.data.message?.replaceAll(
          /{{[\w\d.\[\]]+?}}/g,
          (match) => {
            const id = match.replace("{{", "").replace("}}", "");
            return `[${get(allTokenized, id)}](path://${id})`;
          },
        );
      }
    }
  }

  return messages
    .map((message) => {
      // handle result messages before they were renamed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((message as any).type === "result") {
        message.type = "invocation-result";
      }
      if (message.type === "agent") {
        // handle result messages before they were renamed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((message.data as any).summary) {
          (message.data as any).message = (message.data as any).summary;
          delete (message.data as any).summary;
        }
      }

      return message;
    })
    .map((message) => {
      validateMessage(message);

      return {
        ...message,
        displayableContext: message.metadata?.displayable ?? null,
      };
    });
};

export const getWorkflowMessages = async ({
  clusterId,
  runId,
  last = 100,
  after = "0",
}: {
  clusterId: string;
  runId: string;
  last?: number;
  after?: string;
}): Promise<RunMessage[]> => {
  const messages = await db
    .select({
      id: workflowMessages.id,
      clusterId: workflowMessages.cluster_id,
      runId: workflowMessages.workflow_id,
      type: workflowMessages.type,
      data: workflowMessages.data,
      createdAt: workflowMessages.created_at,
      updatedAt: workflowMessages.updated_at,
    })
    .from(workflowMessages)
    .orderBy(desc(workflowMessages.created_at))
    .where(
      and(
        eq(workflowMessages.cluster_id, clusterId),
        eq(workflowMessages.workflow_id, runId),
        gt(workflowMessages.id, after),
      ),
    )
    .limit(last)
    .then((messages) => messages.reverse());

  return messages
    .map((message) => {
      // handle result messages before they were renamed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((message as any).type === "result") {
        message.type = "invocation-result";
      }
      if (message.type === "agent") {
        // handle result messages before they were renamed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((message.data as any).summary) {
          (message.data as any).message = (message.data as any).summary;
          delete (message.data as any).summary;
        }
      }
      return message;
    })
    .map((message) => {
      return {
        ...message,
        ...validateMessage(message),
      };
    });
};

export const toAnthropicMessages = (
  messages: TypedMessage[],
): Anthropic.MessageParam[] => {
  return (
    messages
      .map(toAnthropicMessage)
      // Merge consecutive messages of the same role
      .reduce((acc, msg) => {
        const currentRole = msg.role;
        const previousMsg = acc[acc.length - 1];

        if (previousMsg?.role === currentRole) {
          if (
            Array.isArray(previousMsg.content) &&
            Array.isArray(msg.content)
          ) {
            previousMsg.content.push(...msg.content);
            return acc;
          }
        }

        acc.push(msg);
        return acc;
      }, [] as Anthropic.MessageParam[])
  );
};

export const toAnthropicMessage = (
  message: TypedMessage,
): Anthropic.MessageParam => {
  switch (message.type) {
    case "agent": {
      const toolUses =
        message.data.invocations?.map((invocation) => {
          if (!invocation.id) throw new Error("Invocation is missing id");
          return {
            type: "tool_use" as const,
            id: invocation.id,
            input: invocation.input,
            name: invocation.toolName,
          };
        }) ?? [];

      return {
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...message.data,
              invocations: undefined,
            }),
          },
          ...toolUses,
        ],
      };
    }
    case "agent-invalid": {
      return {
        role: "assistant",
        content: JSON.stringify(message.data),
      };
    }
    case "invocation-result": {
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.data.id,
            content: [
              {
                type: "text",
                text: JSON.stringify(message.data.result),
              },
            ],
          },
        ],
      };
    }
    case "supervisor":
    case "human":
    case "template": {
      return {
        role: "user",
        content: message.data.details
          ? JSON.stringify(message.data)
          : message.data.message,
      };
    }
  }
};

const validateMessage = (
  message: Pick<RunMessage, "data" | "type">,
): TypedMessage => {
  switch (message.type) {
    case "agent": {
      assertAgentMessage(message);
      break;
    }
    case "invocation-result": {
      assertResultMessage(message);
      break;
    }
    default: {
      assertGenericMessage(message);
    }
  }
  return message;
};

export function hasInvocations(message: AgentMessage): boolean {
  return (
    (message.data.invocations && message.data.invocations.length > 0) ?? false
  );
}

export function assertAgentMessage(
  message: Pick<RunMessage, "data" | "type">,
): asserts message is AgentMessage {
  if (message.type !== "agent") {
    throw new Error("Expected an AgentMessage");
  }

  const result = agentDataSchema.safeParse(message.data);

  if (!result.success) {
    logger.error("Invalid AgentMessage data", {
      data: message.data,
      result,
    });
    throw new Error("Invalid AgentMessage data");
  }
}

export function assertResultMessage(
  message: Pick<RunMessage, "data" | "type">,
): asserts message is InvocationResultMessage {
  if (message.type !== "invocation-result") {
    throw new Error("Expected a InvocationResultMessage");
  }

  const result = resultDataSchema.safeParse(message.data);

  if (!result.success) {
    logger.error("Invalid InvocationResultMessage data", {
      data: message.data,
      result,
    });
    throw new Error("Invalid InvocationResultMessage data");
  }
}

export function assertGenericMessage(
  message: Pick<RunMessage, "data" | "type">,
): asserts message is GenericMessage {
  if (
    !["human", "template", "supervisor", "agent-invalid"].includes(message.type)
  ) {
    throw new Error("Expected a GenericMessage");
  }

  const result = genericMessageDataSchema.safeParse(message.data);

  if (!result.success) {
    logger.error("Invalid GenericMessage data", {
      data: message.data,
      result,
    });
    throw new Error("Invalid GenericMessage data");
  }
}

export const lastAgentMessage = async ({
  clusterId,
  runId,
}: {
  clusterId: string;
  runId: string;
}): Promise<AgentMessage | undefined> => {
  const [result] = await db
    .select({
      id: workflowMessages.id,
      data: workflowMessages.data,
      type: workflowMessages.type,
    })
    .from(workflowMessages)
    .where(
      and(
        eq(workflowMessages.cluster_id, clusterId),
        eq(workflowMessages.workflow_id, runId),
        eq(workflowMessages.type, "agent"),
      ),
    )
    .orderBy(desc(workflowMessages.created_at))
    .limit(1);

  if (!result) {
    return;
  }

  assertAgentMessage(result);
  return result;
};
