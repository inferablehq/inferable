import * as cron from "../cron";
import * as crypto from "crypto";
import * as data from "../data";
import { ToolConfigSchema } from "../contract";
import { z } from "zod";
import { and, eq, lte } from "drizzle-orm";
import { buildModel } from "../models";
import { validateDescription, validateFunctionName, validateFunctionSchema, validateServiceName } from "inferable";
import { InvalidServiceRegistrationError } from "../../utilities/errors";
import jsonpath from "jsonpath";
import { logger } from "../observability/logger";

// The time without a ping before a tool is considered expired
const TOOL_LIVE_THRESHOLD_MS = 60 * 1000; // 1 minute

export type ToolConfig = z.infer<typeof ToolConfigSchema>;

export async function recordToolPoll({
  clusterId,
  name,
}: {
  clusterId: string;
  name: string;
}) {
  const result = await data.db
    .update(data.tools)
    .set({
      last_ping_at: new Date(),
    })
    .where(
      and(
        eq(data.tools.cluster_id, clusterId),
        eq(data.tools.name, name)
      )
    )
    .returning({
      tools: data.tools.name,
    });

  if (result.length === 0) {
    return false;
  }

  return true;
}

export async function upsertToolDefinition({
  name,
  description,
  schema,
  config,
  clusterId,
  group = "default",
  shouldExpire = true,
}: {
  name: string;
  description?: string;
  schema?: string;
  config?: ToolConfig;
  clusterId: string;
  group?: string;
  shouldExpire?: boolean;
}) {

  validateFunctionName(name);
  validateServiceName(group);
  validateDescription(description);

  if (!schema) {
    throw new InvalidServiceRegistrationError("Schema is required");
  }

  const errors = validateFunctionSchema(JSON.parse(schema));
  if (errors.length > 0) {
    throw new InvalidServiceRegistrationError(
      `${name} schema invalid: ${JSON.stringify(errors)}`
    );
  }

  if (config?.cache) {
    try {
      jsonpath.parse(config.cache.keyPath);
    } catch {
      throw new InvalidServiceRegistrationError(
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
      group,
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
        group,
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
