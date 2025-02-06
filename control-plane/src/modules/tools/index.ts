import * as cron from "../cron";
import * as crypto from "crypto";
import * as data from "../data";
import { ToolConfigSchema } from "../contract";
import { z } from "zod";
import { and, desc, cosineDistance, eq, inArray, lte, sql, like } from "drizzle-orm";
import { buildModel } from "../models";
import { InvalidServiceRegistrationError as InvalidToolRegistrationError } from "../../utilities/errors";
import jsonpath from "jsonpath";
import { logger } from "../observability/logger";
import { embedSearchQuery } from "../embeddings/embeddings";
import { validateToolName, validateToolDescription, validateToolSchema } from "./validations";

// The time without a ping before a tool is considered expired
const TOOL_LIVE_THRESHOLD_MS = 60 * 1000; // 1 minute

export type ToolConfig = z.infer<typeof ToolConfigSchema>;

export const getWorkflowTools = async ({
  clusterId,
  workflowName,
}: {
  clusterId: string;
  workflowName: string;
}) => {
  return data.db
    .select({
      name: data.tools.name,
    })
    .from(data.tools)
    .where(
      and(
        eq(data.tools.cluster_id, clusterId),
        like(data.tools.name, `workflows.${workflowName}.%`)
      )
    )
    .then(r =>
      r.map(r => {
        const version = r.name.replace(`workflows.${workflowName}.`, "");

        const parsed = z.string().regex(/^\d+$/).safeParse(version);

        if (!parsed.success) {
          throw new Error(`Invalid version ${version} for service ${r.name}`);
        }

        return {
          name: r.name,
          version: parseInt(parsed.data),
        };
      })
    );
};

export async function availableTools({
  clusterId,
}: {
  clusterId: string;
}) {
  const results = await data.db
    .select({
      name: data.tools.name,
    })
    .from(data.tools)
    .where(eq(data.tools.cluster_id, clusterId))

  return results.map(r => r.name);
}

export const getToolDefinitions = async ({
  clusterId,
}: {
    clusterId: string;
  }) => {
  const results = await data.db
    .select({
      name: data.tools.name,
      description: data.tools.description,
      schema: data.tools.schema,
      config: data.tools.config,
    })
    .from(data.tools)
    .where(eq(data.tools.cluster_id, clusterId))

  return results;
};

export const listTools = async ({
  clusterId,
}: {
  clusterId: string;
}) => {
  const tools = await data.db
    .select({
      name: data.tools.name,
      description: data.tools.description,
      schema: data.tools.schema,
      config: data.tools.config,
      shouldExpire: data.tools.should_expire,
      lastPingAt: data.tools.last_ping_at,
      createdAt: data.tools.created_at,
    })
    .from(data.tools)
    .where(eq(data.tools.cluster_id, clusterId));

  return tools;
};

export const getToolDefinition = async ({
  name,
  clusterId
}: {
  name: string;
  clusterId: string;
}) => {
  const [tool] = await data.db
    .select({
      name: data.tools.name,
      description: data.tools.description,
      schema: data.tools.schema,
      config: data.tools.config,
    })
    .from(data.tools)
    .where(
      and(
        eq(data.tools.name, name),
        eq(data.tools.cluster_id, clusterId)
      )
    )

  return tool;
};

export const searchTools = async ({
  query,
  clusterId,
  limit = 10
}: {
  query: string;
  clusterId: string;
  limit?: number;
}) => {
  const embedding = await embedSearchQuery(query);

  const similarity = sql<number>`1 - (${cosineDistance(
    data.tools.embedding_1024,
    embedding,
  )})`;

  const results = await data.db
    .select({
      name: data.tools.name,
      description: data.tools.description,
      schema: data.tools.schema,
      similarity,
    })
    .from(data.tools)
    .where(
      and(
        eq(data.tools.cluster_id, clusterId),
      ),
    )
    .orderBy((t) => desc(t.similarity))
    .limit(limit);

  return results;
};

export async function recordPoll({
  clusterId,
  tools,
}: {
  clusterId: string;
  tools: string[];
}) {
  const result = await data.db
    .update(data.tools)
    .set({
      last_ping_at: new Date(),
    })
    .where(
      and(
        eq(data.tools.cluster_id, clusterId),
        inArray(data.tools.name, tools)
      )
    )
    .returning({
      tool: data.tools.name,
    });

  // Return any missing tools
  return tools.filter(t => !result.find(r => r.tool === t));
}

export async function deleteToolDefinition({
  name,
  clusterId,
}: {
    name: string;
    clusterId: string;
  }) {
  await data.db
  .delete(data.tools)
  .where(
    and(
      eq(data.tools.name, name),
      eq(data.tools.cluster_id, clusterId)
    )
  );
}

export async function deleteToolDefinitionByPrefix({
  prefix,
  clusterId,
}: {
    prefix: string;
    clusterId: string;
  }) {
  await data.db
  .delete(data.tools)
  .where(
    and(
      like(data.tools.name, `${prefix}%`),
      eq(data.tools.cluster_id, clusterId)
    )
  );
}

export async function upsertToolDefinition({
  name,
  description,
  schema,
  config,
  clusterId,
  shouldExpire = true,
}: {
  name: string;
  description?: string;
  schema?: string;
  config?: ToolConfig;
  clusterId: string;
  shouldExpire?: boolean;
}) {
  validateToolName(name);
  validateToolDescription(description);

  if (!schema) {
    throw new InvalidToolRegistrationError("Schema is required");
  }

  const errors = validateToolSchema(JSON.parse(schema));
  if (errors.length > 0) {
    throw new InvalidToolRegistrationError(
      `${name} schema invalid: ${JSON.stringify(errors)}`
    );
  }

  if (config?.cache) {
    try {
      jsonpath.parse(config.cache.keyPath);
    } catch {
      throw new InvalidToolRegistrationError(
        `${name} cache.keyPath is invalid`,
        "https://docs.inferable.ai/pages/functions#config-cache"
      );
    }
  }

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      name,
      description,
      schema,
      config
    }))
    .digest("hex");

  // Check if definition has changed
  const [existing] = await data.db
    .select({ id: data.tools.name })
    .from(data.tools)
    .where(
      and(
        eq(data.tools.cluster_id, clusterId),
        eq(data.tools.name, name),
        eq(data.tools.hash, hash),
      )
    );

  if (existing) {
    return;
  }

  const embedding = await buildModel({ identifier: "embed-english-v3" }).embedQuery(
    JSON.stringify({
      name,
      description,
      schema,
    }),
  );

  await data.db
    .insert(data.tools)
    .values({
      name,
      description,
      schema,
      config,
      cluster_id: clusterId,
      last_ping_at: new Date(),
      should_expire: shouldExpire,
      embedding_1024: embedding,
      embedding_model: "embed-english-v3",
      hash,
    })
    .onConflictDoUpdate({
      target: [data.tools.name, data.tools.cluster_id],
      set: {
        config,
        schema,
        description,
        last_ping_at: new Date(),
      },
    });
}

export const cleanExpiredToolDefinitions = async (): Promise<void> => {
  const toolDefinitions = await data.db
    .delete(data.tools)
    .where(
      and(
        eq(data.tools.should_expire, true),
        lte(
          data.tools.last_ping_at, new Date(Date.now() - TOOL_LIVE_THRESHOLD_MS)
        )
      )
    ).returning({
      clusterId: data.tools.cluster_id,
      name: data.tools.name,
    });

  logger.info("Cleaned up expired tool definition", {
    tools: toolDefinitions,
  });
};


export const start = () =>
  cron.registerCron(cleanExpiredToolDefinitions, "clean-tool-definitions", {
    interval: 1000 * 10,
  }); // 10 seconds
