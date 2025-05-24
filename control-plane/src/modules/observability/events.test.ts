import * as jobs from "../jobs/jobs";
import { createOwner } from "../test/util";
import { getClusterBackgroundRun } from "../runs";
import * as events from "./events";
import { upsertToolDefinition } from "../tools";
import { db, events as eventsTable } from "../data";
import { and, eq, isNotNull, lt, count } from "drizzle-orm";

const mockTargetSchema = JSON.stringify({
  type: "object",
  properties: {
    test: {
      type: "string",
    },
  },
});

describe("event-aggregation", () => {
  const clusterId = Math.random().toString();

  const simulateActivity = async () => {
    await createOwner({
      clusterId,
    });

    await upsertToolDefinition({
      name: "fn1",
      schema: mockTargetSchema,
      clusterId,
    });

    await upsertToolDefinition({
      name: "fn2",
      schema: mockTargetSchema,
      clusterId,
    });

    const mockJobs = [
      {
        targetFn: "fn1",
        targetArgs: "args",
        resultType: "resolution",
        result: "woof",
      },
      {
        targetFn: "fn1",
        targetArgs: "args",
        resultType: "resolution",
        result: "woof",
      },
      {
        targetFn: "fn1",
        targetArgs: "args",
        resultType: "rejection",
        result: "meow",
      },
      {
        targetFn: "fn2",
        targetArgs: "args",
        resultType: "resolution",
        result: "woof",
      },
      {
        targetFn: "fn2",
        targetArgs: "args",
        resultType: "rejection",
        result: "woof",
      },
      {
        targetFn: "fn2",
        targetArgs: "args",
        resultType: "rejection",
        result: "meow",
      },
    ] as const;

    const jobIds = await Promise.all(
      mockJobs.map(async ({ targetFn, targetArgs, result, resultType }, i) => {
        const job = await jobs.createJobV2({
          owner: {
            clusterId,
          },
          targetFn,
          targetArgs,
          runId: getClusterBackgroundRun(clusterId),
        });

        // wait 100ms
        await new Promise(resolve => setTimeout(resolve, 100));

        await jobs.acknowledgeJob({
          jobId: job.id,
          clusterId,
          machineId: "machine1",
        });

        // wait 100ms
        await new Promise(resolve => setTimeout(resolve, 100));

        await jobs.persistJobResult({
          jobId: job.id,
          machineId: "machine1",
          resultType,
          result,
          functionExecutionTime: 100 * i,
          owner: {
            clusterId,
          },
        });

        return job.id;
      }),
    );

    return { jobIds };
  };

  beforeAll(async () => {
    events.initialize();
  });

  it("should return the correct metrics", async () => {
    const { jobIds } = await simulateActivity();

    await events.buffer?.flush();

    for (const jobId of jobIds) {
      const activity = await events
        .getEventsByClusterId({
          clusterId,
          filters: {
            jobId,
          },
        })
        .then(a => a.reverse());

      expect(activity[0].type).toEqual("jobCreated");
      expect(activity[1].type).toEqual("jobAcknowledged");
      expect(activity[activity.length - 1].type).toEqual("jobResulted");
    }
  });
});

describe("cleanupMarkedEvents", () => {
  it("should delete events marked for deletion and leave others", async () => {
    const clusterId = Math.random().toString();
    const runId = Math.random().toString();

    // Create events
    const event1 = await db
      .insert(eventsTable)
      .values({
        id: `event1-${Math.random()}`,
        cluster_id: clusterId,
        run_id: runId,
        type: "jobCreated",
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 25), // Older than 24 hours
        deleted_at: new Date(Date.now() - 1000 * 60 * 60 * 25), // Marked for deletion, older than 24 hours
      })
      .returning({ id: eventsTable.id })
      .then(rows => rows[0]);

    const event2 = await db
      .insert(eventsTable)
      .values({
        id: `event2-${Math.random()}`,
        cluster_id: clusterId,
        run_id: runId,
        type: "jobAcknowledged",
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 23), // Younger than 24 hours
        deleted_at: new Date(Date.now() - 1000 * 60 * 60 * 23), // Marked for deletion, younger than 24 hours
      })
      .returning({ id: eventsTable.id })
      .then(rows => rows[0]);

    const event3 = await db
      .insert(eventsTable)
      .values({
        id: `event3-${Math.random()}`,
        cluster_id: clusterId,
        run_id: runId,
        type: "jobResulted",
        created_at: new Date(), // Not marked for deletion
      })
      .returning({ id: eventsTable.id })
      .then(rows => rows[0]);

    // Verify initial state
    const initialEvents = await db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(eq(eventsTable.cluster_id, clusterId));
    expect(initialEvents.length).toBe(3);

    // Run cleanup
    await events.cleanupMarkedEvents();

    // Verify state after cleanup
    const remainingEvents = await db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(eq(eventsTable.cluster_id, clusterId));
    expect(remainingEvents.length).toBe(1); // event1 and 2 should be deleted

    const remainingEventIds = remainingEvents.map(e => e.id);
    expect(remainingEventIds).not.toContain(event1.id);
    expect(remainingEventIds).not.toContain(event2.id);
    expect(remainingEventIds).toContain(event3.id);

    // Verify event3 is not marked for deletion
    const [event3AfterCleanup] = await db
      .select({ deleted_at: eventsTable.deleted_at })
      .from(eventsTable)
      .where(eq(eventsTable.id, event3.id));
    expect(event3AfterCleanup.deleted_at).toBeNull();
  });
});
