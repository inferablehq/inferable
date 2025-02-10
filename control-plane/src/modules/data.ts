import advisoryLock from "advisory-lock";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  boolean,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "../utilities/env";
import { logger } from "./observability/logger";
import { z } from "zod";
import { onStatusChangeSchema } from "./contract";
import { ToolConfig } from "./tools";

export const createMutex = advisoryLock(env.DATABASE_URL);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL_DISABLED
    ? false
    : {
        rejectUnauthorized: false,
      },
  allowExitOnIdle: env.DATABASE_ALLOW_EXIT_ON_IDLE,
  max: env.DATABASE_MAX_CONNECTIONS,
});

pool.on("error", err => {
  logger.error("Database connection error on idle client", {
    error: err,
  });
});

pool.on("connect", () => {
  logger.debug("Database connection established");
});

pool.on("release", () => {
  logger.debug("Database connection released");
});

pool.on("remove", () => {
  logger.debug("Database connection removed");
});

// by default jobs have a:
// - timeoutIntervalSeconds: 30
// - maxAttempts: 1
export const jobDefaults = {
  timeoutIntervalSeconds: 30,
  maxAttempts: 1,
};

export const jobs = pgTable(
  "jobs",
  {
    // this column is poorly named, it's actually the job id
    // TODO: (good-first-issue) rename this column to execution_id
    id: varchar("id", { length: 1024 }).notNull().unique(),
    // TODO: rename this column to cluster_id
    cluster_id: text("cluster_id").notNull(),
    target_fn: varchar("target_fn", { length: 1024 }).notNull(),
    target_args: text("target_args").notNull(),
    cache_key: varchar("cache_key", { length: 1024 }),
    status: text("status", {
      enum: ["pending", "running", "success", "failure", "stalled", "interrupted"], // job failure is actually a stalled state. TODO: rename it
    }).notNull(),
    result: text("result"),
    result_type: text("result_type", {
      enum: ["resolution", "rejection", "interrupt"],
    }),
    executing_machine_id: text("executing_machine_id"),
    remaining_attempts: integer("remaining_attempts").notNull().default(jobDefaults.maxAttempts),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    resulted_at: timestamp("resulted_at", { withTimezone: true }),
    last_retrieved_at: timestamp("last_retrieved_at", { withTimezone: true }),
    function_execution_time_ms: integer("function_execution_time_ms"),
    timeout_interval_seconds: integer("timeout_interval_seconds")
      .notNull()
      .default(jobDefaults.timeoutIntervalSeconds),
    // TODO: Deprecated, remove this column
    service: varchar("service", { length: 1024 }),
    run_id: varchar("run_id", { length: 1024 }).notNull(),
    auth_context: json("auth_context"),
    run_context: json("run_context"),
    approval_requested: boolean("approval_requested").notNull().default(false),
    approved: boolean("approved"),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
      name: "jobs_cluster_id_id",
    }),
    clusterServiceStatusIndex: index("clusterServiceStatusIndex").on(
      table.cluster_id,
      table.service,
      table.status
    ),
    clusterServiceStatusFnIndex: index("clusterServiceStatusFnIndex").on(
      table.cluster_id,
      table.service,
      table.target_fn,
      table.status
    ),
  })
);

export const machines = pgTable(
  "machines",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    last_ping_at: timestamp("last_ping_at", { withTimezone: true }).notNull(),
    sdk_version: varchar("sdk_version", { length: 128 }),
    sdk_language: varchar("sdk_language", { length: 128 }),
    ip: varchar("ip", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.id, table.cluster_id],
      name: "machines_id_cluster_id",
    }),
  })
);

export const clusters = pgTable(
  "clusters",
  {
    id: varchar("id", { length: 1024 }).primaryKey(),
    name: varchar("name", { length: 1024 }).notNull(),
    debug: boolean("debug").notNull().default(false),
    enable_custom_auth: boolean("enable_custom_auth").notNull().default(false),
    handle_custom_auth_function: varchar("handle_custom_auth_function", { length: 1024 })
      .default("default_handleCustomAuth")
      .notNull(),
    enable_knowledgebase: boolean("enable_knowledgebase").notNull().default(false),
    description: varchar("description", { length: 1024 }),
    organization_id: varchar("organization_id"),
    additional_context: json("additional_context").$type<{
      current: {
        version: string;
        content: string;
      };
      history: Array<{
        version: string;
        content: string;
      }>;
    }>(),
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    })
      .defaultNow()
      .notNull(),
    deleted_at: timestamp("deleted_at", {
      withTimezone: true,
      precision: 6,
    }),
    is_demo: boolean("is_demo").notNull().default(false),
    is_ephemeral: boolean("is_ephemeral").notNull().default(false),
  },
  table => ({
    idOrgIndex: index("clusters_id_org_index").on(table.id, table.organization_id),
  })
);

export const services = pgTable(
  "services",
  {
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    service: varchar("service", { length: 1024 }).notNull(),
    definition: json("definition"), // this should be named the live definition
    timestamp: timestamp("timestamp", { withTimezone: true }),
    http_trigger_endpoint: varchar("http_trigger_endpoint", { length: 1024 }),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.service],
      name: "services_cluster_id_service",
    }),
  })
);

export const tools = pgTable(
  "tools",
  {
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    name: varchar("name", { length: 1024 }).notNull(),
    description: text("description"),
    schema: text("schema"),
    config: json("config").$type<ToolConfig>(),
    hash: text("hash").notNull(),
    should_expire: boolean("should_expire").notNull(),
    last_ping_at: timestamp("last_ping_at", { withTimezone: true }).notNull(),
    embedding_1024: vector("embedding_1024", {
      dimensions: 1024, // for embed-english-v3
    }).notNull(),
    embedding_model: text("embedding_model", {
      enum: ["embed-english-v3"],
    }).notNull(),
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    })
      .defaultNow()
      .notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.name],
      name: "tools_cluster_id_tools",
    }),
    toolEmbedding1024Index: index("toolEmbedding1024Index").using(
      "hnsw",
      table.embedding_1024.op("vector_cosine_ops")
    ),
  })
);

export const integrations = pgTable(
  "integrations",
  {
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    toolhouse: json("toolhouse").$type<{
      apiKey: string;
    }>(),
    langfuse: json("langfuse").$type<{
      publicKey: string;
      secretKey: string;
      baseUrl: string;
      sendMessagePayloads: boolean;
    }>(),
    tavily: json("tavily").$type<{
      apiKey: string;
    }>(),
    valtown: json("valtown").$type<{
      endpoint: string;
      token: string;
    }>(),
    slack: json("slack").$type<{
      nangoConnectionId: string;
      botUserId: string;
      teamId: string;
      agentId?: string;
    }>(),
    email: json("email").$type<{
      connectionId: string;
      agentId?: string;
      validateSPFandDKIM?: boolean;
    }>(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id],
      name: "integrations_pkey",
    }),
  })
);

export const runTags = pgTable(
  "run_tags",
  {
    cluster_id: varchar("cluster_id").notNull(),
    run_id: varchar("run_id", { length: 1024 }).notNull(),
    key: varchar("key", { length: 1024 }).notNull(),
    value: text("value").notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.run_id, table.key],
      name: "run_tags_cluster_id_run_id_key",
    }),
    runReference: foreignKey({
      columns: [table.run_id, table.cluster_id],
      foreignColumns: [runs.id, runs.cluster_id],
    }).onDelete("cascade"),
    index: index("runTagsIndex").on(table.key, table.value, table.cluster_id),
  })
);

export const externalMessages = pgTable(
  "external_messages",
  {
    message_id: varchar("message_id", { length: 1024 }).notNull(),
    run_id: varchar("run_id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),

    external_id: varchar("external_id", { length: 1024 }).notNull(),

    channel: text("channel", {
      enum: ["slack", "email"],
    }),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.external_id],
      name: "external_messages_pkey",
    }),
    messageReference: foreignKey({
      columns: [table.message_id, table.run_id, table.cluster_id],
      foreignColumns: [runMessages.id, runMessages.run_id, runMessages.cluster_id],
    }).onDelete("cascade"),
    externalMessageIndex: index("externalMessagesIndex").on(table.external_id, table.cluster_id),
  })
);

export const runs = pgTable(
  "runs",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    on_status_change: json("on_status_change").$type<z.infer<typeof onStatusChangeSchema>>(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result_schema: json("result_schema").$type<any>(),
    name: varchar("name", { length: 1024 }).default("").notNull(),
    system_prompt: text("system_prompt"),
    model_identifier: text("model_identifier", {
      enum: ["claude-3-5-sonnet", "claude-3-haiku"],
    }),
    user_id: varchar("user_id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    })
      .defaultNow()
      .notNull(),
    status: text("status", {
      enum: ["pending", "running", "paused", "done", "failed"],
    })
      .default("pending")
      .notNull(),
    failure_reason: text("failure_reason"),
    debug: boolean("debug").notNull().default(false),
    attached_functions: json("attached_functions").$type<string[]>().notNull().default([]),
    test: boolean("test").notNull().default(false),
    test_mocks: json("test_mocks")
      .$type<
        Record<
          string,
          {
            output: Record<string, unknown>;
          }
        >
      >()
      .default({}),
    feedback_comment: text("feedback_comment"),
    feedback_score: integer("feedback_score"),
    agent_id: varchar("agent_id", { length: 128 }),
    agent_version: integer("agent_version"),
    reasoning_traces: boolean("reasoning_traces").default(true).notNull(),
    type: text("type", {
      enum: ["single-step", "multi-step"],
    })
      .default("multi-step")
      .notNull(),
    interactive: boolean("interactive").default(true).notNull(),
    enable_summarization: boolean("enable_summarization").default(false).notNull(),
    enable_result_grounding: boolean("enable_result_grounding").default(false).notNull(),
    auth_context: json("auth_context").$type<unknown>(),
    context: json("context"),
    workflow_execution_id: varchar("workflow_execution_id", { length: 1024 }),
    workflow_version: integer("workflow_version"),
    workflow_name: varchar("workflow_name", { length: 1024 }),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
      name: "workflows_cluster_id_id",
    }),
  })
);

export type RunMessageMetadata = {
  displayable: Record<string, string>;
};

export const runMessages = pgTable(
  "run_messages",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    user_id: varchar("user_id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
    run_id: varchar("run_id", { length: 1024 }).notNull(),
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", {
      withTimezone: true,
      precision: 6,
    }),
    data: json("data").$type<unknown>().notNull(),
    type: text("type", {
      enum: ["human", "invocation-result", "template", "agent", "agent-invalid", "supervisor"],
    }).notNull(),
    metadata: json("metadata").$type<RunMessageMetadata>(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.run_id, table.id],
      name: "run_messages_cluster_id_run_id_id",
    }),
    runReference: foreignKey({
      columns: [table.run_id, table.cluster_id],
      foreignColumns: [runs.id, runs.cluster_id],
    }).onDelete("cascade"),
  })
);

export const embeddings = pgTable(
  "embeddings",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
    model: varchar("model", { length: 1024 }).notNull(),
    group_id: varchar("group_id", { length: 1024 }).notNull(), // ar arbitrary grouping for embeddings within a cluster (e.g. service name)
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    })
      .defaultNow()
      .notNull(),
    type: text("type", {
      enum: ["service-function", "knowledgebase-artifact"],
    }).notNull(),
    embedding_1024: vector("embedding_1024", {
      dimensions: 1024, // for embed-english-v3.0
    }),
    raw_data: text("raw_data").notNull(),
    raw_data_hash: varchar("raw_data_hash", { length: 1024 }).notNull(),
    tags: json("tags").$type<string[]>(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id, table.type],
    }),
    embedding1024Index: index("embedding1024Index").using(
      "hnsw",
      table.embedding_1024.op("vector_cosine_ops")
    ),
    lookupIndex: index("embeddingsLookupIndex").on(
      table.cluster_id,
      table.type,
      table.group_id,
      table.id,
      table.raw_data_hash
    ),
  })
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: varchar("id", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    secret_hash: varchar("secret_hash", { length: 255 }).notNull(),
    // TODO: Remove this field
    type: varchar("type", {
      length: 255,
      enum: ["cluster_manage", "cluster_consume", "cluster_machine"],
    }).notNull(),
    created_by: varchar("created_by", { length: 255 }).notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    revoked_at: timestamp("revoked_at"),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
    }),
    keyHashIndex: uniqueIndex("api_keys_secret_hash_index").on(table.secret_hash),
  })
);

export const blobs = pgTable(
  "blobs",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    name: varchar("name", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
    run_id: varchar("run_id", { length: 1024 }),
    job_id: varchar("job_id", { length: 1024 }),
    data: text("data").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    encoding: varchar("encoding", {
      length: 1024,
      enum: ["base64"],
    }).notNull(),
    type: varchar("type", {
      length: 1024,
      enum: ["application/json", "image/png", "image/jpeg"],
    }).notNull(),
    size: integer("size").notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
    }),
    jobReference: foreignKey({
      columns: [table.cluster_id, table.job_id],
      foreignColumns: [jobs.cluster_id, jobs.id],
    }).onDelete("cascade"),
    runReference: foreignKey({
      columns: [table.cluster_id, table.run_id],
      foreignColumns: [runs.cluster_id, runs.id],
    }).onDelete("cascade"),
  })
);

export const versionedEntities = pgTable(
  "versioned_entities",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
    type: varchar("type", { length: 128 }).notNull(),
    version: integer("version").notNull(),
    entity: json("entity").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id, table.type, table.version],
      name: "versioned_entities_pkey",
    }),
  })
);

export const agents = pgTable(
  "agents",

  {
    id: varchar("id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    name: varchar("name", { length: 1024 }).notNull(),
    initial_prompt: text("initial_prompt"),
    system_prompt: varchar("system_prompt", { length: 1024 }),
    attached_functions: json("attached_functions").$type<string[]>().notNull().default([]),
    // TODO: Rename this to result_schema
    result_schema: json("structured_output"),
    input_schema: json("input_schema"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
      name: "prompt_templates_pkey",
    }),
  })
);

export const events = pgTable(
  "events",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
    type: varchar("type", { length: 1024 }).notNull(),
    job_id: varchar("job_id", { length: 1024 }),
    machine_id: varchar("machine_id", { length: 1024 }),
    target_fn: varchar("target_fn", { length: 1024 }),
    result_type: varchar("result_type", { length: 1024 }),
    status: varchar("status", { length: 1024 }),
    run_id: varchar("run_id", { length: 1024 }),
    user_id: varchar("user_id", { length: 1024 }),
    tool_name: varchar("tool_name", { length: 1024 }),
    model_id: varchar("model_id", { length: 1024 }),
    token_usage_input: integer("token_usage_input"),
    token_usage_output: integer("token_usage_output"),
    attention_level: integer("attention_level"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    meta: json("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  table => ({
    index: index("timeline_index").on(table.cluster_id, table.run_id, table.attention_level),
  })
);

export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
    workflow_execution_id: varchar("workflow_execution_id", { length: 1024 }).notNull(),
    workflow_name: varchar("workflow_name", { length: 1024 }).notNull(),
    version: integer("version").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    job_id: varchar("job_id", { length: 1024 }).notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.id],
      name: "workflow_executions_pkey",
    }),
  })
);

export const clusterKV = pgTable(
  "cluster_kv",
  {
    cluster_id: varchar("cluster_id").notNull(),
    key: varchar("key", { length: 1024 }).notNull(),
    value: text("value").notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.cluster_id, table.key] }),
  })
);

export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    data: json("data").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.timestamp],
      name: "analytics_snapshots_pkey",
    }),
  })
);

export const db = drizzle(pool, {
  schema: {
    runs,
    agents,
    events,
  },
});

export const isAlive = async () => {
  await db.execute(sql`select 1`).catch(e => {
    logger.error("Database connection is not alive", {
      error: e,
    });
    throw e;
  });
};

export const pg = {
  stop: async () => {
    await pool.end();
  },
};
