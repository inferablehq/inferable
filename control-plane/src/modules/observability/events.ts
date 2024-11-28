import { ulid } from "ulid";
import { db, events as eventsTable } from "../data";
import { logger } from "./logger";
import { eq, and, gte, SQL, desc, or, sql } from "drizzle-orm";
import { NotFoundError } from "../../utilities/errors";

export type EventTypes =
  | "jobCreated"
  | "jobAcknowledged"
  | "jobStatusRequest"
  | "jobResulted"
  | "jobResultedButNotPersisted"
  | "jobStalled"
  | "jobStalledTooManyTimes"
  | "jobRecovered"
  | "machineRegistered"
  | "machinePing"
  | "machineStalled"
  | "machineResourceProbe"
  | "modelInvocation"
  | "functionInvocation"
  | "encryptedAgentMessage"
  | "workflowScheduleCreated"
  | "workflowScheduleRemoved"
  | "listenerAttached"
  | "listenerDetached"
  | "listenerNotificationReceived"
  | "humanMessage"
  | "systemMessage"
  | "agentMessage"
  | "agentTool"
  | "agentToolError"
  | "workflowFeedbackSubmitted"
  | "resultSummarized"
  | "knowledgeArtifactsAccessed";

type Event = {
  clusterId: string;
  type: EventTypes;
  jobId?: string;
  machineId?: string;
  service?: string;
  targetFn?: string;
  resultType?: string;
  status?: string;
  workflowId?: string;
  userId?: string;
  toolName?: string;
  tokenUsageInput?: number;
  tokenUsageOutput?: number;
  modelId?: string;
  meta?: {
    value?: string;
    log?: string;
    error?: object;
    result?: string;
    targetArgs?: string;
    functionExecutionTime?: number;
    ip?: string;
    limit?: number;
    attemptsRemaining?: number;
    retryable?: boolean;
    reason?: string;
    pendingJobs?: number;
    machineCount?: number;
    replacedBy?: string;
    config?: object;
    listenerId?: string;
    templateId?: string;
    modelId?: string;
    feedbackScore?: number;
    feedbackComment?: string;
    toolInput?: string;
    summary?: string;
    originalResultSize?: number;
    summarySize?: number;
    artifacts?: string[];
  };
};

export const userAttentionLevels = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
} as const;

const typeToUserAttentionLevel = {
  jobCreated: 10,
  jobAcknowledged: 10,
  jobResulted: 10,
  jobStalled: 30,
  jobStalledTooManyTimes: 40,
  jobRecovered: 30,
  machineRegistered: 10,
  machineStalled: 30,
  machineResourceProbe: 10,
  modelInvocation: 10,
  functionInvocation: 10,
  agentTool: 10,
  agentToolError: 10,
  resultSummarized: 20,
  knowledgeArtifactsAccessed: 20,
} as const;

type InsertableEvent = Event & {
  userAttentionLevel?: (typeof typeToUserAttentionLevel)[keyof typeof typeToUserAttentionLevel];
  createdAt: Date;
  id: string;
};

class EventWriterBuffer {
  private buffer: InsertableEvent[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;

  constructor(private readonly flushInterval: number) {}

  public push(event: InsertableEvent) {
    this.buffer.push(event);

    if (this.flushTimeout === null) {
      this.flushTimeout = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async quit() {
    if (this.flushTimeout !== null) {
      logger.info("Flushing events before exit");
      clearTimeout(this.flushTimeout);
      await this.flush();
    }
  }

  async flush() {
    const events = this.buffer;
    this.buffer = [];
    this.flushTimeout = null;
    await this.writeEvents(events);
  }

  private async writeEvents(insertable: InsertableEvent[], attempt = 0) {
    try {
      if (insertable.length === 0) {
        return;
      }

      const result = await db.insert(eventsTable).values(
        insertable.map((e) => ({
          id: e.id,
          cluster_id: e.clusterId,
          run_id: e.workflowId,
          type: e.type,
          job_id: e.jobId,
          machine_id: e.machineId,
          service: e.service,
          target_fn: e.targetFn,
          result_type: e.resultType,
          status: e.status,
          workflow_id: e.workflowId,
          user_id: e.userId,
          tool_name: e.toolName,
          meta: e.meta,
          created_at: e.createdAt,
          attention_level: e.userAttentionLevel,
          token_usage_input: e.tokenUsageInput,
          token_usage_output: e.tokenUsageOutput,
          model_id: e.modelId,
        })),
      );

      logger.debug("Wrote events", {
        count: result.rowCount,
      });
    } catch (e) {
      if (attempt < 3) {
        logger.error("Failed to write events, retrying", {
          error: e,
        });
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        await this.writeEvents(insertable, attempt + 1);
      } else {
        logger.error("Failed to write events", {
          e,
        });
      }
    }
  }
}

export let buffer: EventWriterBuffer | null = null;

export const initialize = (flushInterval: number = 500) => {
  buffer = new EventWriterBuffer(flushInterval);
};

// Synthetic delay is useful for ordering events that are written in the same tick.
export const write = (event: Event, syntheticDelay = 0) => {
  if (buffer === null) {
    return;
  }

  logger.debug("Adding event to buffer", {
    event: event,
  });

  buffer?.push({
    ...event,
    id: ulid(),
    createdAt: new Date(Date.now() + syntheticDelay),
    userAttentionLevel:
      typeToUserAttentionLevel[
        event.type as keyof typeof typeToUserAttentionLevel
      ],
  });
};

export const getActivityByWorkflowIdForUserAttentionLevel = async (params: {
  clusterId: string;
  runId: string;
  userAttentionLevel: keyof typeof userAttentionLevels;
  after?: string;
}) => {
  const results = await db
    .select({
      id: eventsTable.id,
      clusterId: eventsTable.cluster_id,
      type: eventsTable.type,
      jobId: eventsTable.job_id,
      machineId: eventsTable.machine_id,
      service: eventsTable.service,
      createdAt: eventsTable.created_at,
      targetFn: eventsTable.target_fn,
      resultType: eventsTable.result_type,
      status: eventsTable.status,
      workflowId: eventsTable.run_id,
    })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.cluster_id, params.clusterId),
        eq(eventsTable.run_id, params.runId),
        gte(
          eventsTable.attention_level,
          userAttentionLevels[params.userAttentionLevel],
        ),
      ),
    )
    .limit(100)
    .orderBy(desc(eventsTable.created_at));

  return results;
};

export const getMetaForActivity = async (params: {
  clusterId: string;
  eventId: string;
}) => {
  const s = await db
    .select({
      id: eventsTable.id,
      clusterId: eventsTable.cluster_id,
      type: eventsTable.type,
      jobId: eventsTable.job_id,
      machineId: eventsTable.machine_id,
      service: eventsTable.service,
      createdAt: eventsTable.created_at,
      targetFn: eventsTable.target_fn,
      resultType: eventsTable.result_type,
      status: eventsTable.status,
      workflowId: eventsTable.run_id,
      meta: eventsTable.meta,
    })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.cluster_id, params.clusterId),
        eq(eventsTable.id, params.eventId),
      ),
    )
    .limit(1);

  if (s.length === 0) {
    throw new NotFoundError("Event not found");
  }

  return s[0];
};

export const getActivityByClusterId = async (params: {
  clusterId: string;
  filters?: {
    type?: string;
    jobId?: string;
    machineId?: string;
    service?: string;
    workflowId?: string;
  };
  includeMeta?: boolean;
}) => {
  const results = await db
    .select({
      id: eventsTable.id,
      clusterId: eventsTable.cluster_id,
      type: eventsTable.type,
      jobId: eventsTable.job_id,
      machineId: eventsTable.machine_id,
      service: eventsTable.service,
      createdAt: eventsTable.created_at,
      targetFn: eventsTable.target_fn,
      resultType: eventsTable.result_type,
      status: eventsTable.status,
      workflowId: eventsTable.run_id,
      ...(params.includeMeta ? { meta: eventsTable.meta } : {}),
    })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.cluster_id, params.clusterId),
        ...([
          params.filters?.type && eq(eventsTable.type, params.filters.type),
          params.filters?.jobId && eq(eventsTable.job_id, params.filters.jobId),
          params.filters?.machineId &&
            eq(eventsTable.machine_id, params.filters.machineId),
          params.filters?.service &&
            eq(eventsTable.service, params.filters.service),
          params.filters?.workflowId &&
            eq(eventsTable.run_id, params.filters.workflowId),
        ].filter(Boolean) as SQL[]),
      ),
    )
    .orderBy(desc(eventsTable.created_at))
    .limit(100);

  return results;
};

export const getUsageActivity = async (params: { clusterId: string }) => {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const modelUsage = await db
    .select({
      date: sql<string>`DATE(created_at)`,
      modelId: eventsTable.model_id,
      totalInputTokens:
        sql<number>`sum(cast(token_usage_input as integer))`.mapWith(Number),
      totalOutputTokens:
        sql<number>`sum(cast(token_usage_output as integer))`.mapWith(Number),
      totalModelInvocations: sql<number>`count(*)`.mapWith(Number),
    })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.cluster_id, params.clusterId),
        eq(eventsTable.type, "modelInvocation"),
        gte(eventsTable.created_at, sixtyDaysAgo),
      ),
    )
    .groupBy(sql`DATE(created_at)`, eventsTable.model_id)
    .orderBy(sql`DATE(created_at)` as SQL);

  const agentRuns = await db
    .select({
      date: sql<string>`DATE(created_at)`,
      totalAgentRuns: sql<number>`count(*)`.mapWith(Number),
    })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.cluster_id, params.clusterId),
        eq(eventsTable.type, "modelInvocation"),
        gte(eventsTable.created_at, sixtyDaysAgo),
      ),
    )
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)` as SQL);

  return {
    modelUsage,
    agentRuns,
  };
};

export const events = {
  write,
};
