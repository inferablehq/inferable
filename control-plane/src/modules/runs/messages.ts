import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gt, InferSelectModel, ne, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { UnifiedMessage, unifiedMessageSchema } from "../contract";
import { db, RunMessageMetadata, runMessages } from "../data";
import { logger } from "../observability/logger";

export type TypedMessage = z.infer<typeof unifiedMessageSchema>;

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

export type RunMessage = z.infer<typeof unifiedMessageSchema>;

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
  type: InferSelectModel<typeof runMessages>["type"];
  data: InferSelectModel<typeof runMessages>["data"];
  metadata?: RunMessageMetadata;
}) => {
  return db
    .insert(runMessages)
    .values({
      id,
      user_id: userId ?? "SYSTEM",
      cluster_id: clusterId,
      run_id: runId,
      metadata,
      type,
      data,
    })
    .returning({
      id: runMessages.id,
    })
    .then(result => result[0]);
};

export const getRunMessagesForDisplay = async ({
  clusterId,
  runId,
  limit = 50,
  after = "0",
}: {
  clusterId: string;
  runId: string;
  limit?: number;
  after?: string;
}): Promise<UnifiedMessage[]> => {
  const messages = await db
    .select({
      id: runMessages.id,
      data: runMessages.data,
      type: runMessages.type,
      createdAt: runMessages.created_at,
      metadata: runMessages.metadata,
    })
    .from(runMessages)
    .orderBy(desc(runMessages.created_at))
    .where(
      and(
        eq(runMessages.cluster_id, clusterId),
        eq(runMessages.run_id, runId),
        gt(runMessages.id, after),
        ne(runMessages.type, "agent-invalid"),
        ne(runMessages.type, "supervisor"),
        ne(runMessages.type, "result" as any)
      )
    )
    .limit(limit);

  const parsed = messages
    .map(message => {
      // handle result messages before they were renamed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((message as any).type === "result") {
        message.type = "invocation-result";
      }

      // Handle invocation-result messages before resutlType and toolName were added
      if (message.type === "invocation-result") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ('resultType' ! in (message.data as any)) {
          (message.data as any).resultType = "resolution";
        }

        if ('toolName' ! in (message.data as any)) {
          // Intentionally setting this to a "falsy" value as it will calculated below
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (message.data as any).toolName = "";
        }
      }

      if (message.type === "agent") {
        // handle result messages before they were renamed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((message.data as any).summary) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (message.data as any).message = (message.data as any).summary;
          delete (message.data as any).summary;
        }
      }

      return message;
    })
    .map(message => {
      const { success, data, error } = unifiedMessageSchema.safeParse(message);

      if (!success) {
        logger.error("Invalid message data. Returning supervisor message", {
          rawMessage: message,
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

  parsed.forEach(message => {
    if (message.type === "invocation-result") {

      // Handle invocation-result from before toolName was added
      if (!message.data.toolName) {

        // Find the initial invocation
        parsed
          .filter(m => m.type === "agent" && m.data.invocations?.length)
          .forEach(m => {
            assertMessageOfType("agent", m).data.invocations?.forEach(invocation => {
              if (invocation.id === message.data.id) {
                message.data.toolName = invocation.toolName;
              }
            });
          })
      }

      // Remove nested result ulid which is present for result grounding but makes the result difficult to type on the client
      if (message.data.id in message.data.result) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nested = message.data.result[message.data.id] as any;
        if ('result' in nested) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          message.data.result = nested.result as any;
        }
      }

      if (!message.data.toolName) {
        logger.error("Could not find invocation for invocation-result message", {
          msg: message,
        });
      }
    }
  });

  return parsed;
};

export const getRunMessagesForDisplayWithPolling = async ({
  clusterId,
  runId,
  timeout = 20_000,
  limit = 100,
  after = "0",
}: {
  clusterId: string;
  runId: string;
  limit?: number;
  after?: string;
  timeout?: number;
}): Promise<UnifiedMessage[]> => {
  let rowsCount = 0;
  const delay = 200;
  const startTime = Date.now();

  do {
    const messages = await getRunMessagesForDisplay({ clusterId, runId, limit, after });
    rowsCount = messages.length;

    if (rowsCount > 0) {
      return messages;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  } while (Date.now() - startTime < timeout);

  // Return empty array if no messages found after timeout
  return [];
};

export const getMessageCountForCluster = async (clusterId: string) => {
  const messages = await db
    .select({ count: sql<number>`count(*)` })
    .from(runMessages)
    .where(eq(runMessages.cluster_id, clusterId));

  return messages[0].count;
};

export const getRunMessages = async ({
  clusterId,
  runId,
  limit = 100,
  after = "0",
}: {
  clusterId: string;
  runId: string;
  limit?: number;
  after?: string;
}): Promise<UnifiedMessage[]> => {
  const messages = await db
    .select({
      id: runMessages.id,
      clusterId: runMessages.cluster_id,
      runId: runMessages.run_id,
      type: runMessages.type,
      data: runMessages.data,
      createdAt: runMessages.created_at,
      updatedAt: runMessages.updated_at,
    })
    .from(runMessages)
    .orderBy(desc(runMessages.created_at))
    .where(
      and(
        eq(runMessages.cluster_id, clusterId),
        eq(runMessages.run_id, runId),
        gt(runMessages.id, after)
      )
    )
    .limit(limit)
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
        ...unifiedMessageSchema.parse(message),
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
  const result = unifiedMessageSchema.safeParse(message);

  if (!result.success) {
    logger.error("Invalid message data", {
      message,
      error: result.error,
    });
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
      id: runMessages.id,
      data: runMessages.data,
      type: runMessages.type,
    })
    .from(runMessages)
    .where(
      and(
        eq(runMessages.cluster_id, clusterId),
        eq(runMessages.run_id, runId),
        eq(runMessages.type, "agent")
      )
    )
    .orderBy(desc(runMessages.created_at))
    .limit(1);

  if (!result) {
    return;
  }

  return assertMessageOfType("agent", result);
};
