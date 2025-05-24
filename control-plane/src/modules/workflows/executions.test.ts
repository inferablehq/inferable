import { cleanupMarkedWorkflowExecutions } from "./executions";
import { createCluster } from "../clusters/management";
import * as data from "../data";
import { count, eq, or } from "drizzle-orm";
import { ulid } from "ulid";
import { createJobV2 } from "../jobs/create-job";
import { getClusterBackgroundRun } from "../runs";
import { createRun } from "../runs";
import { kv } from "../kv";
import * as events from "../observability/events";
import { upsertToolDefinition } from "../tools";
import { packer } from "../../utilities/packer";

const mockTargetSchema = JSON.stringify({
  type: "object",
  properties: {
    test: {
      type: "string",
    },
  },
});

describe("workflows/executions", () => {
  beforeAll(async () => {
    events.initialize();
  });

  describe("cleanupMarkedWorkflowExecutions", () => {
    it("should delete workflow executions that are marked for deletion", async () => {
      const cluster = await createCluster({
        description: "Test cluster for workflow execution cleanup",
        organizationId: "test-org-id",
      });

      // Create tool definition first
      await upsertToolDefinition({
        name: "testWorkflow",
        schema: mockTargetSchema,
        clusterId: cluster.id,
      });

      // Create a job for the workflow execution
      const job = await createJobV2({
        owner: { clusterId: cluster.id },
        targetFn: "testWorkflow",
        targetArgs: packer.pack({ test: "data" }),
        runId: getClusterBackgroundRun(cluster.id),
      });

      // Create a workflow execution
      const executionId = ulid();
      await data.db.insert(data.workflowExecutions).values({
        id: executionId,
        cluster_id: cluster.id,
        job_id: job.id,
        workflow_name: "testWorkflow",
        workflow_version: 1,
        deleted_at: new Date(Date.now() - 1000 * 60 * 60 * 24), // Mark for deletion
      });

      // Create some events for the job
      await data.db.insert(data.events).values({
        id: ulid(),
        cluster_id: cluster.id,
        job_id: job.id,
        type: "jobCreated",
      });

      // Create some KV data for the execution
      await kv.setOrReplace(
        cluster.id,
        `${executionId}_memo_test`,
        "test-value",
      );

      await cleanupMarkedWorkflowExecutions();

      // Verify the workflow execution still exists (only job data should be cleaned)
      const [existingExecution] = await data.db
        .select({ count: count(data.workflowExecutions.id) })
        .from(data.workflowExecutions)
        .where(eq(data.workflowExecutions.id, executionId));

      expect(existingExecution.count).toBe(1);

      // Verify events are marked as deleted - check separately
      const eventsAfterCleanup = await data.db
        .select({
          id: data.events.id,
          deletedAt: data.events.deleted_at,
        })
        .from(data.events)
        .where(eq(data.events.job_id, job.id));

      expect(eventsAfterCleanup.length).toBe(1);
      expect(eventsAfterCleanup[0].deletedAt).not.toBeNull();

      // Verify KV data is deleted
      const kvData = await kv.getAllByPrefix(cluster.id, `${executionId}_`);
      expect(kvData.length).toBe(0);

      // Verify job data is cleared
      const [jobData] = await data.db
        .select({
          result: data.jobs.result,
          targetArgs: data.jobs.target_args,
        })
        .from(data.jobs)
        .where(eq(data.jobs.id, job.id));

      expect(jobData.result).toBeNull();
      expect(jobData.targetArgs).toBe("");
    });

    it("should ignore workflow executions which are not marked for deletion", async () => {
      const cluster = await createCluster({
        description: "Test cluster for workflow execution cleanup",
        organizationId: "test-org-id",
      });

      // Create tool definition first
      await upsertToolDefinition({
        name: "testWorkflow2",
        schema: mockTargetSchema,
        clusterId: cluster.id,
      });

      // Create a job for the workflow execution
      const job = await createJobV2({
        owner: { clusterId: cluster.id },
        targetFn: "testWorkflow2",
        targetArgs: packer.pack({ test: "data" }),
        runId: getClusterBackgroundRun(cluster.id),
      });

      // Create a workflow execution without marking it for deletion
      const executionId = ulid();
      await data.db.insert(data.workflowExecutions).values({
        id: executionId,
        cluster_id: cluster.id,
        job_id: job.id,
        workflow_name: "testWorkflow2",
        workflow_version: 1,
      });

      // Create some KV data for the execution
      await kv.setOrReplace(
        cluster.id,
        `${executionId}_memo_test`,
        "test-value",
      );

      await cleanupMarkedWorkflowExecutions();

      // Verify the workflow execution still exists
      const [exists] = await data.db
        .select({ count: count(data.workflowExecutions.id) })
        .from(data.workflowExecutions)
        .where(eq(data.workflowExecutions.id, executionId));

      expect(exists.count).toBe(1);

      // Verify job data is not cleared
      const [jobData] = await data.db
        .select({
          result: data.jobs.result,
          targetArgs: data.jobs.target_args,
        })
        .from(data.jobs)
        .where(eq(data.jobs.id, job.id));

      expect(jobData.targetArgs).toBe(packer.pack({ test: "data" }));

      const kvData = await kv.getAllByPrefix(cluster.id, `${executionId}_`);
      expect(kvData.length).toBe(1);
    });

    it("should handle multiple workflow executions correctly", async () => {
      const cluster = await createCluster({
        description: "Test cluster for workflow execution cleanup",
        organizationId: "test-org-id",
      });

      // Create tool definitions first
      await upsertToolDefinition({
        name: "testWorkflow",
        schema: mockTargetSchema,
        clusterId: cluster.id,
      });

      // Create jobs for workflow executions
      const job1 = await createJobV2({
        owner: { clusterId: cluster.id },
        targetFn: "testWorkflow",
        targetArgs: packer.pack({ test: "data1" }),
        runId: getClusterBackgroundRun(cluster.id),
      });

      const job2 = await createJobV2({
        owner: { clusterId: cluster.id },
        targetFn: "testWorkflow",
        targetArgs: packer.pack({ test: "data2" }),
        runId: getClusterBackgroundRun(cluster.id),
      });

      // Create workflow executions
      const executionId1 = ulid();
      const executionId2 = ulid();

      // Create some KV data for the execution
      await kv.setOrReplace(
        cluster.id,
        `${executionId1}_memo_test`,
        "test-value",
      );
      await kv.setOrReplace(
        cluster.id,
        `${executionId2}_memo_test`,
        "test-value",
      );

      // Mark first for deletion, leave third unmarked
      await data.db.insert(data.workflowExecutions).values([
        {
          id: executionId1,
          cluster_id: cluster.id,
          job_id: job1.id,
          workflow_name: "testWorkflow",
          workflow_version: 1,
          deleted_at: new Date(Date.now() - 1000 * 60 * 60 * 24),
        },
        {
          id: executionId2,
          cluster_id: cluster.id,
          job_id: job2.id,
          workflow_name: "testWorkflow",
          workflow_version: 1,
          // Not marked for deletion
        },
      ]);

      await cleanupMarkedWorkflowExecutions();

      // Verify all workflow executions still exist
      const [allExecutions] = await data.db
        .select({ count: count(data.workflowExecutions.id) })
        .from(data.workflowExecutions)
        .where(
          or(
            eq(data.workflowExecutions.id, executionId1),
            eq(data.workflowExecutions.id, executionId2),
          ),
        );

      expect(allExecutions.count).toBe(2);

      // Verify job data is cleared for marked executions
      const [job1Data] = await data.db
        .select({
          result: data.jobs.result,
          targetArgs: data.jobs.target_args,
        })
        .from(data.jobs)
        .where(eq(data.jobs.id, job1.id));

      const [job2Data] = await data.db
        .select({
          result: data.jobs.result,
          targetArgs: data.jobs.target_args,
        })
        .from(data.jobs)
        .where(eq(data.jobs.id, job2.id));

      // First job should have cleared data
      expect(job1Data.result).toBeNull();
      expect(job1Data.targetArgs).toBe("");

      // Third job should retain data
      expect(job2Data.targetArgs).toBe(packer.pack({ test: "data2" }));

      const kvData = await kv.getAllByPrefix(cluster.id, `${executionId1}_`);
      expect(kvData.length).toBe(0);

      const kvData3 = await kv.getAllByPrefix(cluster.id, `${executionId2}_`);
      expect(kvData3.length).toBe(1);
    });
  });
});
