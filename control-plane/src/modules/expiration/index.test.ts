import { eq, inArray } from "drizzle-orm";
import { db, clusters, events, runs, workflowExecutions, jobs } from "../data";
import { createOwner } from "../test/util";
import { expireEvents, expireRuns, expireWorkflowExecutions } from "./index";
import { ulid } from "ulid";

describe("expiration", () => {
  describe("expireEvents", () => {
    it("should only mark events from clusters with event_expiry_age set and older than expiry age", async () => {
      // Create test clusters
      const clusterWithExpiry = await createOwner({
        clusterId: `cluster-with-expiry-${ulid()}`,
      });
      const clusterWithoutExpiry = await createOwner({
        clusterId: `cluster-without-expiry-${ulid()}`,
      });
      const clusterWithDifferentExpiry = await createOwner({
        clusterId: `cluster-different-expiry-${ulid()}`,
      });

      // Set expiry ages
      await db
        .update(clusters)
        .set({ event_expiry_age: 3600 }) // 1 hour
        .where(eq(clusters.id, clusterWithExpiry.clusterId));

      await db
        .update(clusters)
        .set({ event_expiry_age: 7200 }) // 2 hours
        .where(eq(clusters.id, clusterWithDifferentExpiry.clusterId));

      // Create events with different ages
      const oldEvent1 = await db
        .insert(events)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          type: "jobCreated",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: events.id })
        .then(rows => rows[0]);

      const recentEvent1 = await db
        .insert(events)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          type: "jobCreated",
          created_at: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        })
        .returning({ id: events.id })
        .then(rows => rows[0]);

      const oldEvent2 = await db
        .insert(events)
        .values({
          id: ulid(),
          cluster_id: clusterWithoutExpiry.clusterId,
          type: "jobCreated",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: events.id })
        .then(rows => rows[0]);

      const oldEvent3 = await db
        .insert(events)
        .values({
          id: ulid(),
          cluster_id: clusterWithDifferentExpiry.clusterId,
          type: "jobCreated",
          created_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000), // 1.5 hours ago
        })
        .returning({ id: events.id })
        .then(rows => rows[0]);

      const alreadyDeletedEvent = await db
        .insert(events)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          type: "jobCreated",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          deleted_at: new Date(), // Already marked for deletion
        })
        .returning({ id: events.id })
        .then(rows => rows[0]);

      // Run expiration
      await expireEvents();

      // Check results
      const eventsAfterExpiration = await db
        .select({
          id: events.id,
          clusterId: events.cluster_id,
          deletedAt: events.deleted_at,
        })
        .from(events)
        .where(
          inArray(events.id, [
            oldEvent1.id,
            recentEvent1.id,
            oldEvent2.id,
            oldEvent3.id,
            alreadyDeletedEvent.id,
          ])
        );

      const eventMap = new Map(eventsAfterExpiration.map(e => [e.id, e]));

      // oldEvent1 should be marked for deletion (cluster has 1h expiry, event is 2h old)
      expect(eventMap.get(oldEvent1.id)?.deletedAt).not.toBeNull();

      // recentEvent1 should NOT be marked for deletion (cluster has 1h expiry, event is 30m old)
      expect(eventMap.get(recentEvent1.id)?.deletedAt).toBeNull();

      // oldEvent2 should NOT be marked for deletion (cluster has no expiry)
      expect(eventMap.get(oldEvent2.id)?.deletedAt).toBeNull();

      // oldEvent3 should NOT be marked for deletion (cluster has 2h expiry, event is 1.5h old)
      expect(eventMap.get(oldEvent3.id)?.deletedAt).toBeNull();

      // alreadyDeletedEvent should still be marked for deletion (no change)
      expect(eventMap.get(alreadyDeletedEvent.id)?.deletedAt).not.toBeNull();
    });

    it("should not affect events from other clusters", async () => {
      const targetCluster = await createOwner({
        clusterId: `target-cluster-${ulid()}`,
      });
      const otherCluster = await createOwner({
        clusterId: `other-cluster-${ulid()}`,
      });

      // Set expiry only on target cluster
      await db
        .update(clusters)
        .set({ event_expiry_age: 3600 }) // 1 hour
        .where(eq(clusters.id, targetCluster.clusterId));

      // Create old events in both clusters
      const targetEvent = await db
        .insert(events)
        .values({
          id: ulid(),
          cluster_id: targetCluster.clusterId,
          type: "jobCreated",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: events.id })
        .then(rows => rows[0]);

      const otherEvent = await db
        .insert(events)
        .values({
          id: ulid(),
          cluster_id: otherCluster.clusterId,
          type: "jobCreated",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: events.id })
        .then(rows => rows[0]);

      await expireEvents();

      const [targetEventAfter] = await db
        .select({ deletedAt: events.deleted_at })
        .from(events)
        .where(eq(events.id, targetEvent.id));

      const [otherEventAfter] = await db
        .select({ deletedAt: events.deleted_at })
        .from(events)
        .where(eq(events.id, otherEvent.id));

      expect(targetEventAfter.deletedAt).not.toBeNull();
      expect(otherEventAfter.deletedAt).toBeNull();
    });
  });

  describe("expireRuns", () => {
    it("should only mark runs from clusters with run_expiry_age set and older than expiry age", async () => {
      const clusterWithExpiry = await createOwner({
        clusterId: `cluster-with-expiry-${ulid()}`,
      });
      const clusterWithoutExpiry = await createOwner({
        clusterId: `cluster-without-expiry-${ulid()}`,
      });

      // Set expiry age
      await db
        .update(clusters)
        .set({ run_expiry_age: 3600 }) // 1 hour
        .where(eq(clusters.id, clusterWithExpiry.clusterId));

      // Create runs with different ages
      const oldRun = await db
        .insert(runs)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          user_id: "test-user",
          status: "done",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: runs.id })
        .then(rows => rows[0]);

      const recentRun = await db
        .insert(runs)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          user_id: "test-user",
          status: "done",
          created_at: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        })
        .returning({ id: runs.id })
        .then(rows => rows[0]);

      const runInClusterWithoutExpiry = await db
        .insert(runs)
        .values({
          id: ulid(),
          cluster_id: clusterWithoutExpiry.clusterId,
          user_id: "test-user",
          status: "done",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: runs.id })
        .then(rows => rows[0]);

      const alreadyDeletedRun = await db
        .insert(runs)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          user_id: "test-user",
          status: "done",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          deleted_at: new Date(), // Already marked for deletion
        })
        .returning({ id: runs.id })
        .then(rows => rows[0]);

      // Run expiration
      await expireRuns();

      // Check results
      const runsAfterExpiration = await db
        .select({
          id: runs.id,
          deletedAt: runs.deleted_at,
        })
        .from(runs)
        .where(
          inArray(runs.id, [
            oldRun.id,
            recentRun.id,
            runInClusterWithoutExpiry.id,
            alreadyDeletedRun.id,
          ])
        );

      const runMap = new Map(runsAfterExpiration.map(r => [r.id, r]));

      // oldRun should be marked for deletion
      expect(runMap.get(oldRun.id)?.deletedAt).not.toBeNull();

      // recentRun should NOT be marked for deletion
      expect(runMap.get(recentRun.id)?.deletedAt).toBeNull();

      // runInClusterWithoutExpiry should NOT be marked for deletion
      expect(runMap.get(runInClusterWithoutExpiry.id)?.deletedAt).toBeNull();

      // alreadyDeletedRun should still be marked for deletion
      expect(runMap.get(alreadyDeletedRun.id)?.deletedAt).not.toBeNull();
    });

    it("should not affect runs from other clusters", async () => {
      const targetCluster = await createOwner({
        clusterId: `target-cluster-${ulid()}`,
      });
      const otherCluster = await createOwner({
        clusterId: `other-cluster-${ulid()}`,
      });

      // Set expiry only on target cluster
      await db
        .update(clusters)
        .set({ run_expiry_age: 3600 }) // 1 hour
        .where(eq(clusters.id, targetCluster.clusterId));

      // Create old runs in both clusters
      const targetRun = await db
        .insert(runs)
        .values({
          id: ulid(),
          cluster_id: targetCluster.clusterId,
          user_id: "test-user",
          status: "done",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: runs.id })
        .then(rows => rows[0]);

      const otherRun = await db
        .insert(runs)
        .values({
          id: ulid(),
          cluster_id: otherCluster.clusterId,
          user_id: "test-user",
          status: "done",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: runs.id })
        .then(rows => rows[0]);

      await expireRuns();

      const [targetRunAfter] = await db
        .select({ deletedAt: runs.deleted_at })
        .from(runs)
        .where(eq(runs.id, targetRun.id));

      const [otherRunAfter] = await db
        .select({ deletedAt: runs.deleted_at })
        .from(runs)
        .where(eq(runs.id, otherRun.id));

      expect(targetRunAfter.deletedAt).not.toBeNull();
      expect(otherRunAfter.deletedAt).toBeNull();
    });
  });

  describe("expireWorkflowExecutions", () => {
    it("should only mark workflow executions from clusters with workflow_execution_expiry_age set and older than expiry age", async () => {
      const clusterWithExpiry = await createOwner({
        clusterId: `cluster-with-expiry-${ulid()}`,
      });
      const clusterWithoutExpiry = await createOwner({
        clusterId: `cluster-without-expiry-${ulid()}`,
      });

      // Set expiry age
      await db
        .update(clusters)
        .set({ workflow_execution_expiry_age: 3600 }) // 1 hour
        .where(eq(clusters.id, clusterWithExpiry.clusterId));

      // Create jobs first (required for workflow executions foreign key)
      const oldJob = await db
        .insert(jobs)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          target_fn: "test-workflow",
          target_args: "{}",
          status: "success",
          run_id: "test-run",
        })
        .returning({ id: jobs.id })
        .then(rows => rows[0]);

      const recentJob = await db
        .insert(jobs)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          target_fn: "test-workflow",
          target_args: "{}",
          status: "success",
          run_id: "test-run",
        })
        .returning({ id: jobs.id })
        .then(rows => rows[0]);

      const jobInClusterWithoutExpiry = await db
        .insert(jobs)
        .values({
          id: ulid(),
          cluster_id: clusterWithoutExpiry.clusterId,
          target_fn: "test-workflow",
          target_args: "{}",
          status: "success",
          run_id: "test-run",
        })
        .returning({ id: jobs.id })
        .then(rows => rows[0]);

      const alreadyDeletedJob = await db
        .insert(jobs)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          target_fn: "test-workflow",
          target_args: "{}",
          status: "success",
          run_id: "test-run",
        })
        .returning({ id: jobs.id })
        .then(rows => rows[0]);

      // Create workflow executions with different ages
      const oldExecution = await db
        .insert(workflowExecutions)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          job_id: oldJob.id,
          workflow_name: "test-workflow",
          workflow_version: 1,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: workflowExecutions.id })
        .then(rows => rows[0]);

      const recentExecution = await db
        .insert(workflowExecutions)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          job_id: recentJob.id,
          workflow_name: "test-workflow",
          workflow_version: 1,
          created_at: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        })
        .returning({ id: workflowExecutions.id })
        .then(rows => rows[0]);

      const executionInClusterWithoutExpiry = await db
        .insert(workflowExecutions)
        .values({
          id: ulid(),
          cluster_id: clusterWithoutExpiry.clusterId,
          job_id: jobInClusterWithoutExpiry.id,
          workflow_name: "test-workflow",
          workflow_version: 1,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: workflowExecutions.id })
        .then(rows => rows[0]);

      const alreadyDeletedExecution = await db
        .insert(workflowExecutions)
        .values({
          id: ulid(),
          cluster_id: clusterWithExpiry.clusterId,
          job_id: alreadyDeletedJob.id,
          workflow_name: "test-workflow",
          workflow_version: 1,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          deleted_at: new Date(), // Already marked for deletion
        })
        .returning({ id: workflowExecutions.id })
        .then(rows => rows[0]);

      // Run expiration
      await expireWorkflowExecutions();

      // Check results
      const executionsAfterExpiration = await db
        .select({
          id: workflowExecutions.id,
          deletedAt: workflowExecutions.deleted_at,
        })
        .from(workflowExecutions)
        .where(
          inArray(workflowExecutions.id, [
            oldExecution.id,
            recentExecution.id,
            executionInClusterWithoutExpiry.id,
            alreadyDeletedExecution.id,
          ])
        );

      const executionMap = new Map(executionsAfterExpiration.map(e => [e.id, e]));

      // oldExecution should be marked for deletion
      expect(executionMap.get(oldExecution.id)?.deletedAt).not.toBeNull();

      // recentExecution should NOT be marked for deletion
      expect(executionMap.get(recentExecution.id)?.deletedAt).toBeNull();

      // executionInClusterWithoutExpiry should NOT be marked for deletion
      expect(executionMap.get(executionInClusterWithoutExpiry.id)?.deletedAt).toBeNull();

      // alreadyDeletedExecution should still be marked for deletion
      expect(executionMap.get(alreadyDeletedExecution.id)?.deletedAt).not.toBeNull();
    });

    it("should not affect workflow executions from other clusters", async () => {
      const targetCluster = await createOwner({
        clusterId: `target-cluster-${ulid()}`,
      });
      const otherCluster = await createOwner({
        clusterId: `other-cluster-${ulid()}`,
      });

      // Set expiry only on target cluster
      await db
        .update(clusters)
        .set({ workflow_execution_expiry_age: 3600 }) // 1 hour
        .where(eq(clusters.id, targetCluster.clusterId));

      // Create jobs first
      const targetJob = await db
        .insert(jobs)
        .values({
          id: ulid(),
          cluster_id: targetCluster.clusterId,
          target_fn: "test-workflow",
          target_args: "{}",
          status: "success",
          run_id: "test-run",
        })
        .returning({ id: jobs.id })
        .then(rows => rows[0]);

      const otherJob = await db
        .insert(jobs)
        .values({
          id: ulid(),
          cluster_id: otherCluster.clusterId,
          target_fn: "test-workflow",
          target_args: "{}",
          status: "success",
          run_id: "test-run",
        })
        .returning({ id: jobs.id })
        .then(rows => rows[0]);

      // Create old workflow executions in both clusters
      const targetExecution = await db
        .insert(workflowExecutions)
        .values({
          id: ulid(),
          cluster_id: targetCluster.clusterId,
          job_id: targetJob.id,
          workflow_name: "test-workflow",
          workflow_version: 1,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: workflowExecutions.id })
        .then(rows => rows[0]);

      const otherExecution = await db
        .insert(workflowExecutions)
        .values({
          id: ulid(),
          cluster_id: otherCluster.clusterId,
          job_id: otherJob.id,
          workflow_name: "test-workflow",
          workflow_version: 1,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        })
        .returning({ id: workflowExecutions.id })
        .then(rows => rows[0]);

      await expireWorkflowExecutions();

      const [targetExecutionAfter] = await db
        .select({ deletedAt: workflowExecutions.deleted_at })
        .from(workflowExecutions)
        .where(eq(workflowExecutions.id, targetExecution.id));

      const [otherExecutionAfter] = await db
        .select({ deletedAt: workflowExecutions.deleted_at })
        .from(workflowExecutions)
        .where(eq(workflowExecutions.id, otherExecution.id));

      expect(targetExecutionAfter.deletedAt).not.toBeNull();
      expect(otherExecutionAfter.deletedAt).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle clusters with null expiry ages gracefully", async () => {
      const cluster = await createOwner({
        clusterId: `cluster-null-expiry-${ulid()}`,
      });

      // Explicitly set expiry ages to null
      await db
        .update(clusters)
        .set({
          event_expiry_age: null,
          run_expiry_age: null,
          workflow_execution_expiry_age: null,
        })
        .where(eq(clusters.id, cluster.clusterId));

      // Create old entities
      const oldEvent = await db
        .insert(events)
        .values({
          id: ulid(),
          cluster_id: cluster.clusterId,
          type: "jobCreated",
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        })
        .returning({ id: events.id })
        .then(rows => rows[0]);

      const oldRun = await db
        .insert(runs)
        .values({
          id: ulid(),
          cluster_id: cluster.clusterId,
          user_id: "test-user",
          status: "done",
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        })
        .returning({ id: runs.id })
        .then(rows => rows[0]);

      // Create job first for workflow execution
      const oldJob = await db
        .insert(jobs)
        .values({
          id: ulid(),
          cluster_id: cluster.clusterId,
          target_fn: "test-workflow",
          target_args: "{}",
          status: "success",
          run_id: "test-run",
        })
        .returning({ id: jobs.id })
        .then(rows => rows[0]);

      const oldExecution = await db
        .insert(workflowExecutions)
        .values({
          id: ulid(),
          cluster_id: cluster.clusterId,
          job_id: oldJob.id,
          workflow_name: "test-workflow",
          workflow_version: 1,
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        })
        .returning({ id: workflowExecutions.id })
        .then(rows => rows[0]);

      // Run all expiration functions
      await Promise.all([expireEvents(), expireRuns(), expireWorkflowExecutions()]);

      // Check that nothing was marked for deletion
      const [eventAfter] = await db
        .select({ deletedAt: events.deleted_at })
        .from(events)
        .where(eq(events.id, oldEvent.id));

      const [runAfter] = await db
        .select({ deletedAt: runs.deleted_at })
        .from(runs)
        .where(eq(runs.id, oldRun.id));

      const [executionAfter] = await db
        .select({ deletedAt: workflowExecutions.deleted_at })
        .from(workflowExecutions)
        .where(eq(workflowExecutions.id, oldExecution.id));

      expect(eventAfter.deletedAt).toBeNull();
      expect(runAfter.deletedAt).toBeNull();
      expect(executionAfter.deletedAt).toBeNull();
    });

    it("should handle empty clusters gracefully", async () => {
      const emptyCluster = await createOwner({
        clusterId: `empty-cluster-${ulid()}`,
      });

      // Set expiry ages but don't create any entities
      await db
        .update(clusters)
        .set({
          event_expiry_age: 3600,
          run_expiry_age: 3600,
          workflow_execution_expiry_age: 3600,
        })
        .where(eq(clusters.id, emptyCluster.clusterId));

      // Should not throw errors
      await expect(expireEvents()).resolves.not.toThrow();
      await expect(expireRuns()).resolves.not.toThrow();
      await expect(expireWorkflowExecutions()).resolves.not.toThrow();
    });

    it("should handle very large expiry ages", async () => {
      const cluster = await createOwner({
        clusterId: `large-expiry-cluster-${ulid()}`,
      });

      // Set large expiry ages (1 year in seconds) - within PostgreSQL integer range
      const largeExpiry = 365 * 24 * 60 * 60; // 1 year
      await db
        .update(clusters)
        .set({
          event_expiry_age: largeExpiry,
          run_expiry_age: largeExpiry,
          workflow_execution_expiry_age: largeExpiry,
        })
        .where(eq(clusters.id, cluster.clusterId));

      // Create old entities
      const oldEvent = await db
        .insert(events)
        .values({
          id: ulid(),
          cluster_id: cluster.clusterId,
          type: "jobCreated",
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        })
        .returning({ id: events.id })
        .then(rows => rows[0]);

      // Run expiration
      await expireEvents();

      // Should not be marked for deletion due to large expiry
      const [eventAfter] = await db
        .select({ deletedAt: events.deleted_at })
        .from(events)
        .where(eq(events.id, oldEvent.id));

      expect(eventAfter.deletedAt).toBeNull();
    });
  });
});
