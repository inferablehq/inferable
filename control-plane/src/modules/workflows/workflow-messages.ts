import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gt, InferSelectModel, ne, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { UnifiedMessage, unifiedMessageDataSchema } from "../contract";
import { db, RunMessageMetadata, workflowMessages } from "../data";
import { events } from "../observability/events";
import { resumeRun } from "./workflows";
import { logger } from "../observability/logger";

export type TypedMessage = z.infer<typeof unifiedMessageDataSchema>;

/**
 * A structured response from the agent.
 */
export type AgentMessage = Extract<TypedMessage, { type: "agent" }>;

/**
 * The result of a tool call.
 */
export type InvocationResultMessage = Extract<TypedMessage, { type: "invocation-result" }>;

/**
 * A generic message container.
 */
export type GenericMessage = Extract<
  TypedMessage,
  { type: "human" | "template" | "supervisor" | "agent-invalid" }
>;

export type RunMessage = z.infer<typeof unifiedMessageDataSchema>;

export const insertRunMessage = async ({
  clusterId,
  userId,
  runId,
  id,
  type,
  data,
  metadata,
}: {
  id: string;
  userId?: string;
  clusterId: string;
  runId: string;
  type: InferSelectModel<typeof workflowMessages>["type"];
  data: InferSelectModel<typeof workflowMessages>["data"];
  metadata?: RunMessageMetadata;
}) => {
  return db
    .insert(workflowMessages)
    .values({
      id,
      user_id: userId ?? "SYSTEM",
      cluster_id: clusterId,
      workflow_id: runId,
      metadata,
      type,
      data,
    })
    .returning({
      id: workflowMessages.id,
    });
};

export const editHumanMessage = async ({
  clusterId,
  runId,
  userId,
  message,
  id,
}: {
  clusterId: string;
  userId?: string;
  runId: string;
  message: string;
  id: string;
}) => {
  const [inserted] = await insertRunMessage({
    clusterId,
    userId,
    runId,
    data: {
      message,
    },
    type: "human",
    id: ulid(),
  });

  events.write({
    clusterId,
    workflowId: runId,
    type: "messageRetried",
    meta: {
      messageId: id,
    },
  });

  await resumeRun({
    clusterId,
    id: runId,
  });

  return {
    inserted,
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
}): Promise<UnifiedMessage[]> => {
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
        ne(workflowMessages.type, "result" as any)
      )
    )
    .limit(last);

  return messages
    .map(message => {
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
    .map(message => {
      const { success, data, error } = unifiedMessageDataSchema.safeParse(message);

      if (!success) {
        logger.error("Invalid message data. Returning supervisor message", {
          message,
          error: error?.message,
        });

        return {
          id: ulid(),
          type: "supervisor" as const,
          data: {
            message: "Invalid message data",
            details: {
              error: error?.message,
            },
          },
          createdAt: new Date(),
        };
      }

      return data;
    });
};

export const getRunMessagesForDisplayWithPolling = async ({
  clusterId,
  runId,
  last = 100,
  after = "0",
}: {
  clusterId: string;
  runId: string;
  last?: number;
  after?: string;
}): Promise<UnifiedMessage[]> => {
  let rowsCount = 0;
  const delay = 200;
  const timeout = 20_000;
  const startTime = Date.now();

  do {
    const messages = await getRunMessagesForDisplay({ clusterId, runId, last, after });
    rowsCount = messages.length;

    if (rowsCount > 0) {
      return messages;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  } while (Date.now() - startTime < timeout);

  // Return empty array if no messages found after timeout
  return [];
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
}): Promise<UnifiedMessage[]> => {
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
        gt(workflowMessages.id, after)
      )
    )
    .limit(last)
    .then(messages => messages.reverse());

  return messages
    .map(message => {
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
    .map(message => {
      return {
        ...message,
        ...unifiedMessageDataSchema.parse(message),
      };
    });
};

export const toAnthropicMessages = (messages: TypedMessage[]): Anthropic.MessageParam[] => {
  return (
    messages
      .map(toAnthropicMessage)
      // Merge consecutive messages of the same role
      .reduce((acc, msg) => {
        const currentRole = msg.role;
        const previousMsg = acc[acc.length - 1];

        if (previousMsg?.role === currentRole) {
          if (Array.isArray(previousMsg.content) && Array.isArray(msg.content)) {
            previousMsg.content.push(...msg.content);
            return acc;
          }
        }

        acc.push(msg);
        return acc;
      }, [] as Anthropic.MessageParam[])
  );
};

export const toAnthropicMessage = (message: TypedMessage): Anthropic.MessageParam => {
  switch (message.type) {
    case "agent": {
      const toolUses =
        message.data.invocations?.map(invocation => {
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
        content: message.data.details ? JSON.stringify(message.data) : message.data.message,
      };
    }
  }
};

export function hasInvocations(message: AgentMessage): boolean {
  return (message.data.invocations && message.data.invocations.length > 0) ?? false;
}

export function assertMessageOfType<
  T extends "agent" | "invocation-result" | "human" | "template" | "supervisor" | "agent-invalid",
>(type: T, message: unknown) {
  const result = unifiedMessageDataSchema.safeParse(message);

  if (!result.success) {
    throw new Error("Invalid message data");
  }

  if (result.data.type !== type) {
    throw new Error(`Expected a ${type} message. Got ${result.data.type}`);
  }

  return result.data as Extract<TypedMessage, { type: T }>;
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
        eq(workflowMessages.type, "agent")
      )
    )
    .orderBy(desc(workflowMessages.created_at))
    .limit(1);

  if (!result) {
    return;
  }

  return assertMessageOfType("agent", result);
};

export const getMessageByReference = async (reference: string, clusterId: string) => {
  const [result] = await db
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
    .where(
      and(
        eq(workflowMessages.cluster_id, clusterId),
        sql`metadata->>'externalReference' = ${reference}`
      )
    );

  return result;
};

export const updateMessageReference = async ({
  externalReference,
  clusterId,
  messageId,
}: {
  externalReference: string;
  clusterId: string;
  messageId: string;
}) => {
  await db
    .update(workflowMessages)
    .set({
      metadata: sql`COALESCE(${workflowMessages.metadata}, '{}')::jsonb || ${JSON.stringify({ externalReference })}::jsonb`,
    })
    .where(and(eq(workflowMessages.cluster_id, clusterId), eq(workflowMessages.id, messageId)));
};
