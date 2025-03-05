import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { env } from "../../utilities/env";
import { JobPollTimeoutError, NotFoundError } from "../../utilities/errors";
import * as cron from "../cron";
import * as data from "../data";
import * as events from "../observability/events";
import { packer } from "../../utilities/packer";
import { resumeRun } from "../runs";
import { notifyApprovalRequest } from "../runs/notify";
import { selfHealJobs } from "./self-heal-jobs";
import { notificationSchema } from "../contract";
import { z } from "zod";
import { logger } from "../observability/logger";
import { persistJobInterrupt } from "./job-results";

export { createJobV2 } from "./create-job";
export { acknowledgeJob, persistJobResult } from "./job-results";

export type ResultType = "resolution" | "rejection" | "interrupt";

export const getJobStatusSync = async ({
  jobId,
  owner,
  ttl = 60_000,
}: {
  jobId: string;
  owner: { clusterId: string };
  ttl?: number;
}) => {
  let jobResult:
    | {
        status:
          | "pending"
          | "running"
          | "success"
          | "failure"
          | "stalled"
          | "interrupted";
        result: string | null;
        resultType: ResultType | null;
      }
    | undefined;

  const start = Date.now();

  do {
    const [job] = await data.db
      .select({
        status: data.jobs.status,
        result: data.jobs.result,
        resultType: data.jobs.result_type,
      })
      .from(data.jobs)
      .where(
        and(eq(data.jobs.id, jobId), eq(data.jobs.cluster_id, owner.clusterId)),
      );

    if (!job) {
      throw new NotFoundError(`Job ${jobId} not found`);
    }

    if (job.status === "success" || job.status === "failure") {
      jobResult = job;
    } else {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } while (!jobResult && Date.now() - start < ttl);

  if (!jobResult) {
    throw new JobPollTimeoutError(`Call did not resolve within ${ttl}ms`);
  }

  return jobResult;
};

export const getJob = async ({
  clusterId,
  jobId,
}: {
  clusterId: string;
  jobId: string;
}) => {
  const [job] = await data.db
    .select({
      id: data.jobs.id,
      clusterId: data.jobs.cluster_id,
      status: data.jobs.status,
      targetFn: data.jobs.target_fn,
      executingMachineId: data.jobs.executing_machine_id,
      targetArgs: data.jobs.target_args,
      result: data.jobs.result,
      resultType: data.jobs.result_type,
      createdAt: data.jobs.created_at,
      runId: data.jobs.run_id,
      runContext: data.jobs.run_context,
      authContext: data.jobs.auth_context,
      approvalRequested: data.jobs.approval_requested,
      approved: data.jobs.approved,
    })
    .from(data.jobs)
    .where(and(eq(data.jobs.id, jobId), eq(data.jobs.cluster_id, clusterId)));

  if (!job) {
    return undefined;
  }

  return {
    ...job,
  };
};

export const getLatestJobsResultedByFunctionName = async ({
  clusterId,
  functionName,
  limit,
  resultType,
}: {
  clusterId: string;
  functionName: string;
  limit: number;
  resultType: ResultType;
}) => {
  return data.db
    .select({
      result: data.jobs.result,
      resultType: data.jobs.result_type,
      targetArgs: data.jobs.target_args,
    })
    .from(data.jobs)
    .where(
      and(
        eq(data.jobs.cluster_id, clusterId),
        eq(data.jobs.target_fn, functionName),
        eq(data.jobs.result_type, resultType),
      ),
    )
    .orderBy(desc(data.jobs.created_at))
    .limit(limit);
};

export const getJobsForRun = async ({
  clusterId,
  runId,
  after = "0",
}: {
  clusterId: string;
  runId: string;
  after?: string;
}) => {
  return data.db
    .select({
      id: data.jobs.id,
      status: data.jobs.status,
      targetFn: data.jobs.target_fn,
      resultType: data.jobs.result_type,
      createdAt: data.jobs.created_at,
      approvalRequested: data.jobs.approval_requested,
      approved: data.jobs.approved,
    })
    .from(data.jobs)
    .where(
      and(
        eq(data.jobs.cluster_id, clusterId),
        eq(data.jobs.run_id, runId),
        gt(data.jobs.id, after),
      ),
    );
};

const waitForPendingJobsByTools = async ({
  clusterId,
  timeout,
  start,
  tools,
}: {
  clusterId: string;
  timeout: number;
  start: number;
  tools: string[];
}): Promise<void> => {
  const hasPendingJobs = await data.db
    .select({ count: sql<number>`COUNT(*)` })
    .from(data.jobs)
    .where(
      and(
        eq(data.jobs.status, "pending"),
        eq(data.jobs.cluster_id, clusterId),
        inArray(data.jobs.target_fn, tools),
      ),
    )
    .limit(1)
    .then(r => Number(r[0]?.count || 0) > 0);

  if (hasPendingJobs) {
    return;
  }

  if (Date.now() - start > timeout) {
    return;
  }

  // wait for 500ms
  await new Promise(resolve => setTimeout(resolve, 500));
  return waitForPendingJobsByTools({ clusterId, timeout, start, tools });
};

export const pollJobsByTools = async ({
  tools,
  clusterId,
  machineId,
  limit,
  timeout = env.JOB_LONG_POLLING_TIMEOUT,
}: {
  tools: string[];
  clusterId: string;
  machineId: string;
  limit: number;
  timeout?: number;
}) => {
  if (tools.length === 0) {
    return [];
  }

  await waitForPendingJobsByTools({
    clusterId,
    timeout,
    start: Date.now(),
    tools,
  });

  type Result = {
    id: string;
    target_fn: string;
    target_args: string;
    auth_context: unknown;
    run_context: unknown;
    approved: boolean;
  };

  const results = await data.db.execute<Result>(sql`
     UPDATE
       jobs SET status = 'running',
       remaining_attempts = remaining_attempts - 1,
       last_retrieved_at = now(),
       executing_machine_id=${machineId}
     WHERE
       id IN (
         SELECT id
         FROM jobs
         WHERE
           status = 'pending'
           AND cluster_id = ${clusterId}
           AND target_fn IN (${sql.join(tools, sql`, `)})
         LIMIT ${limit}
         FOR UPDATE SKIP LOCKED
       )
       AND cluster_id = ${clusterId}
     RETURNING id, target_fn, target_args, auth_context, run_context, approved`);

  const jobs: {
    id: string;
    targetFn: string;
    targetArgs: string;
    authContext: unknown;
    runContext: unknown;
    approved: boolean;
  }[] = results.rows.map(row => ({
    id: row.id as string,
    targetFn: row.target_fn as string,
    targetArgs: row.target_args as string,
    authContext: row.auth_context,
    runContext: row.run_context,
    approved: row.approved,
  }));

  jobs.forEach(job => {
    events.write({
      type: "jobAcknowledged",
      jobId: job.id,
      clusterId,
      machineId,
      targetFn: job.targetFn,
      meta: {
        targetArgs: job.targetArgs,
      },
    });
  });

  return jobs;
};

export async function requestApproval({
  jobId,
  clusterId,
  notification,
  machineId,
}: {
  jobId: string;
  clusterId: string;
  machineId: string;
  notification?: z.infer<typeof notificationSchema>;
}) {
  const updated = await persistJobInterrupt({
    jobId,
    clusterId,
    machineId,
    approvalRequested: true,
  });

  if (updated) {
    events.write({
      type: "approvalRequested",
      jobId,
      clusterId,
      runId: updated.runId,
      targetFn: updated.targetFn,
      meta: {
        notification,
      },
    });

    if (updated.runId || notification) {
      try {
        // TODO: This should be moved onto a queue
        await notifyApprovalRequest({
          clusterId: updated.clusterId,
          jobId: updated.jobId,
          targetFn: updated.targetFn,
          runId: updated.runId,
          notification,
        });
      } catch (e) {
        logger.warn("Failed to notify approval request", {
          error: e,
        });

        events.write({
          type: "notificationFailed",
          jobId,
          clusterId,
          runId: updated.runId,
          meta: {
            error: e,
          },
        });
      }
    }
  }
}

export async function cancelJob({
  jobId,
  clusterId,
}: {
  jobId: string;
  clusterId: string;
}) {
  await data.db
    .update(data.jobs)
    .set({
      status: "success",
      result_type: "rejection",
      result: packer.pack({
        message: "This call was cancelled by the user.",
      }),
    })
    .where(and(eq(data.jobs.id, jobId), eq(data.jobs.cluster_id, clusterId)));
}

export async function submitApproval({
  jobId,
  clusterId,
  approved,
}: {
  jobId: string;
  clusterId: string;
  approved: boolean;
}) {
  if (approved) {
    const [updated] = await data.db
      .update(data.jobs)
      .set({
        approved: true,
        status: "pending",
        executing_machine_id: null,
        last_retrieved_at: null,
        remaining_attempts: sql`remaining_attempts + 1`,
      })
      .where(
        and(
          eq(data.jobs.id, jobId),
          eq(data.jobs.cluster_id, clusterId),
          // Do not allow denying a job that has already been approved
          isNull(data.jobs.approved),
          eq(data.jobs.approval_requested, true),
        ),
      )
      .returning({
        runId: data.jobs.run_id,
        targetFn: data.jobs.target_fn,
      });

    if (updated) {
      events.write({
        type: "approvalGranted",
        jobId,
        clusterId,
        runId: updated.runId,
        targetFn: updated.targetFn,
      });
    }
  } else {
    const [updated] = await data.db
      .update(data.jobs)
      .set({
        approved: false,
        status: "success",
        result_type: "rejection",
        result: packer.pack({
          message: "This call was denied by the user.",
        }),
      })
      .returning({
        runId: data.jobs.run_id,
        targetFn: data.jobs.target_fn,
        resultType: data.jobs.result_type,
      })
      .where(
        and(
          eq(data.jobs.id, jobId),
          eq(data.jobs.cluster_id, clusterId),
          // Do not allow denying a job that has already been approved
          isNull(data.jobs.approved),
          eq(data.jobs.approval_requested, true),
        ),
      );

    if (updated) {
      events.write({
        type: "approvalDenied",
        jobId,
        clusterId,
        runId: updated.runId,
        targetFn: updated.targetFn,
      });
    }

    if (updated?.runId) {
      await resumeRun({
        clusterId,
        id: updated.runId,
      });
    }
  }
}

export const start = () =>
  cron.registerCron(selfHealJobs, "self-heal-calls", { interval: 1000 * 5 }); // 5 seconds
