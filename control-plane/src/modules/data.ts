import { relations, sql } from "drizzle-orm";
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
import { MessageData } from "./workflows/workflow-messages";
import advisoryLock from "advisory-lock";

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
      enum: ["pending", "running", "success", "failure", "stalled"], // job failure is actually a stalled state. TODO: rename it
    }).notNull(),
    result: text("result"),
    result_type: text("result_type", {
      enum: ["resolution", "rejection", "interrupt"],
    }),
    executing_machine_id: text("executing_machine_id"),
    remaining_attempts: integer("remaining_attempts").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    resulted_at: timestamp("resulted_at", { withTimezone: true }),
    last_retrieved_at: timestamp("last_retrieved_at", { withTimezone: true }),
    function_execution_time_ms: integer("function_execution_time_ms"),
    timeout_interval_seconds: integer("timeout_interval_seconds").notNull().default(300),
    service: varchar("service", { length: 1024 }).notNull(),
    workflow_id: varchar("workflow_id", { length: 1024 }),
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
    status: text("status", {
      enum: ["active", "inactive"],
    }).default("active"),
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
    enable_run_configs: boolean("enable_run_configs").notNull().default(false),
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
    queue_url: varchar("queue_url", { length: 1024 }),
    definition: json("definition"), // this should be named the live definition
    timestamp: timestamp("timestamp", { withTimezone: true }),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.service],
      name: "services_cluster_id_service",
    }),
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
    valTown: json("valTown").$type<{
      endpoint: string;
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

export const workflowMetadata = pgTable(
  "workflow_metadata",
  {
    cluster_id: varchar("cluster_id").notNull(),
    workflow_id: varchar("workflow_id", { length: 1024 }).notNull(),
    key: varchar("key", { length: 1024 }).notNull(),
    value: text("value").notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.workflow_id, table.key],
      name: "workflow_metadata_cluster_id_workflow_id_key",
    }),
    workflowReference: foreignKey({
      columns: [table.workflow_id, table.cluster_id],
      foreignColumns: [workflows.id, workflows.cluster_id],
    }).onDelete("cascade"),
    index: index("workflowMetadataIndex").on(table.key, table.value, table.cluster_id),
  })
);

export const workflows = pgTable(
  "workflows",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    // TODO: Rename this to `on_status_change`
    on_status_change: varchar("result_function", { length: 1024 }),
    result_schema: json("result_schema"),
    name: varchar("name", { length: 1024 }).default("").notNull(),
    system_prompt: varchar("system_prompt", { length: 1024 }),
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
    }).default("pending"),
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
    config_id: varchar("config_id", { length: 128 }),
    config_version: integer("config_version"),
    reasoning_traces: boolean("reasoning_traces").default(true).notNull(),
    interactive: boolean("interactive").default(true).notNull(),
    enable_summarization: boolean("enable_summarization").default(false).notNull(),
    enable_result_grounding: boolean("enable_result_grounding").default(false).notNull(),
    custom_auth_token: text("custom_auth_token"),
    auth_context: json("auth_context"),
    context: json("context"),
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

export const workflowMessages = pgTable(
  "workflow_messages",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    user_id: varchar("user_id", { length: 1024 }).notNull(),
    cluster_id: varchar("cluster_id").notNull(),
    workflow_id: varchar("workflow_id", { length: 1024 }).notNull(),
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
    data: json("data").$type<MessageData>().notNull(),
    type: text("type", {
      enum: ["human", "invocation-result", "template", "agent", "agent-invalid", "supervisor"],
    }).notNull(),
    metadata: json("metadata").$type<RunMessageMetadata>(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.workflow_id, table.id],
      name: "workflow_messages_cluster_id_workflow_id_id",
    }),
    workflowReference: foreignKey({
      columns: [table.workflow_id, table.cluster_id],
      foreignColumns: [workflows.id, workflows.cluster_id],
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
      enum: ["service-function", "prompt-template", "knowledgebase-artifact"],
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
    workflow_id: varchar("workflow_id", { length: 1024 }),
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
    workflowReference: foreignKey({
      columns: [table.cluster_id, table.workflow_id],
      foreignColumns: [workflows.cluster_id, workflows.id],
    }).onDelete("cascade"),
  })
);

export const toolMetadata = pgTable(
  "tool_metadata",
  {
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    service: varchar("service", { length: 1024 }).notNull(),
    function_name: varchar("function_name", { length: 1024 }).notNull(),
    user_defined_context: text("user_defined_context"),
    result_keys: json("result_keys").$type<{ key: string; last_seen: number }[]>().default([]),
  },
  table => ({
    pk: primaryKey({
      columns: [table.cluster_id, table.service, table.function_name],
      name: "tool_metadata_pkey",
    }),
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

export const promptTemplates = pgTable(
  "prompt_templates",

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
    service: varchar("service", { length: 1024 }),
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
    meta: json("meta")
      .$type<Record<string, string | boolean | number | object>>()
      .notNull()
      .default({}),
  },
  table => ({
    index: index("timeline_index").on(table.cluster_id, table.run_id, table.attention_level),
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
    workflows,
    toolMetadata,
    promptTemplates,
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
