import { and, desc, eq, gt, gte, or, SQL, sql, isNotNull } from "drizzle-orm";
import { ulid } from "ulid";
import { NotFoundError } from "../../utilities/errors";
import { db, events as eventsTable } from "../data";
import { logger } from "./logger";
import * as cron from "../cron";

// Name format <noun>_<verb>(Past tense)_<qualifier>
export type EventTypes =
  // Jobs
  | "jobCreated"
  | "jobAcknowledged"
  | "jobResulted"
  | "jobResultedButNotPersisted"
  | "jobStalled"
  | "jobStalledTooManyTimes"
  | "jobRecovered"

  // Approvals
  | "approvalRequested"
  | "approvalGranted"
  | "approvalDenied"

  // Tool Calls (i.e Within an Agent Runs)
  | "toolInvocationCreated"
  | "toolInvocationFailed"
  | "toolInvocationResulted"

  // Machines
  | "machineRegistered"
  | "machinePinged"

  // Notifications
  | "notificationSent"
  | "notificationFailed"

  // Misc
  | "modelInvoked"
  | "feedbackSubmitted"
  | "toolSearchCompleted"

  // Workflows
  | "workflowLogCreated";

type Event = {
  type: EventTypes;
  clusterId: string;
  jobId?: string;
  toolName?: string;
  machineId?: string;
  runId?: string;
  modelId?: string;

  // TODO: Remove
  targetFn?: string;
  resultType?: string;
  status?: string;
  userId?: string;
  tokenUsageInput?: number;
  tokenUsageOutput?: number;
  meta?: Record<string, unknown>;
};

type InsertableEvent = Event & {
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
        insertable.map(e => ({
          id: e.id,
          cluster_id: e.clusterId,
          run_id: e.runId,
          type: e.type,
          job_id: e.jobId,
          machine_id: e.machineId,
          target_fn: e.targetFn,
          result_type: e.resultType,
          status: e.status,
          user_id: e.userId,
          tool_name: e.toolName,
          meta: e.meta,
          created_at: e.createdAt,
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
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
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
  });
};

export const getEventsForRunTimeline = async (params: {
  clusterId: string;
  runId: string;
  after?: string;
}) => {
  const results = await db
    .select({
      id: eventsTable.id,
      clusterId: eventsTable.cluster_id,
      type: eventsTable.type,
      jobId: eventsTable.job_id,
      machineId: eventsTable.machine_id,
      createdAt: eventsTable.created_at,
      targetFn: eventsTable.target_fn,
      resultType: eventsTable.result_type,
      status: eventsTable.status,
      run_id: eventsTable.run_id,
    })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.cluster_id, params.clusterId),
        eq(eventsTable.run_id, params.runId),
        ...(params.after ? [gt(eventsTable.id, params.after)] : []),
      ),
    )
    .limit(100)
    .orderBy(desc(eventsTable.created_at));

  return results;
};

export const getMetaForEvent = async (params: {
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
      createdAt: eventsTable.created_at,
      targetFn: eventsTable.target_fn,
      resultType: eventsTable.result_type,
      status: eventsTable.status,
      run_id: eventsTable.run_id,
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

export const getEventsByClusterId = async (params: {
  clusterId: string;
  filters?: {
    type?: string;
    jobId?: string;
    machineId?: string;
    runId?: string;
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
      createdAt: eventsTable.created_at,
      targetFn: eventsTable.target_fn,
      resultType: eventsTable.result_type,
      status: eventsTable.status,
      runId: eventsTable.run_id,
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
          params.filters?.runId && eq(eventsTable.run_id, params.filters.runId),
        ].filter(Boolean) as SQL[]),
      ),
    )
    .orderBy(desc(eventsTable.created_at))
    .limit(100);

  return results;
};

export const getEventsForJobId = async (params: {
  jobId: string;
  clusterId: string;
}) => {
  const results = await db
    .select({
      id: eventsTable.id,
      clusterId: eventsTable.cluster_id,
      type: eventsTable.type,
      jobId: eventsTable.job_id,
      machineId: eventsTable.machine_id,
      createdAt: eventsTable.created_at,
      targetFn: eventsTable.target_fn,
      resultType: eventsTable.result_type,
      status: eventsTable.status,
      runId: eventsTable.run_id,
      meta: eventsTable.meta,
    })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.job_id, params.jobId),
        eq(eventsTable.cluster_id, params.clusterId),
      ),
    )
    .orderBy(desc(eventsTable.created_at))
    .limit(1000);

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
        or(
          eq(eventsTable.type, "modelInvoked"),
          // Backward compatibility
          eq(eventsTable.type, "modelInvocation"),
        ),
        gte(eventsTable.created_at, sixtyDaysAgo),
      ),
    )
    .groupBy(sql`DATE(created_at)`, eventsTable.model_id)
    .orderBy(sql`DATE(created_at)` as SQL);

  const runs = await db
    .select({
      date: sql<string>`DATE(created_at)`,
      totalRuns: sql<number>`count(*)`.mapWith(Number),
    })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.cluster_id, params.clusterId),
        or(
          eq(eventsTable.type, "modelInvoked"),
          // Backward compatibility
          eq(eventsTable.type, "modelInvocation"),
        ),
        gte(eventsTable.created_at, sixtyDaysAgo),
      ),
    )
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)` as SQL);

  return {
    modelUsage,
    runs,
  };
};

export const events = {
  write,
};

export const cleanupMarkedEvents = async () => {
  try {
    await db.delete(eventsTable).where(isNotNull(eventsTable.deleted_at));

    logger.info("Deleted marked events");
  } catch (error) {
    logger.error("Error deleting marked events", {
      error,
    });
  }
};

export const start = async () => {
  await cron.registerCron(cleanupMarkedEvents, "cleanup-marked-events", {
    interval: 1000 * 60 * 15,
  }); // 15 minutes
};
