import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { env } from "../../utilities/env";
import { JobPollTimeoutError, NotFoundError } from "../../utilities/errors";
import { getBlobsForJobs } from "../blobs";
import * as cron from "../cron";
import * as data from "../data";
import * as events from "../observability/events";
import { packer } from "../packer";
import { resumeRun } from "../workflows/workflows";
import { selfHealJobs as selfHealCalls } from "./persist-result";
import { notifyApprovalRequest } from "../workflows/notify";

export { createJob } from "./create-job";
export { acknowledgeJob, persistJobResult } from "./persist-result";

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
        service: string;
        status: "pending" | "running" | "success" | "failure" | "stalled";
        result: string | null;
        resultType: ResultType | null;
      }
    | undefined;

  const start = Date.now();

  do {
    const [job] = await data.db
      .select({
        service: data.jobs.service,
        status: data.jobs.status,
        result: data.jobs.result,
        resultType: data.jobs.result_type,
      })
      .from(data.jobs)
      .where(and(eq(data.jobs.id, jobId), eq(data.jobs.cluster_id, owner.clusterId)));

    if (!job) {
      throw new NotFoundError(`Job ${jobId} not found`);
    }

    if (job.status === "success" || job.status === "failure") {
      jobResult = job;
    } else {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } while (!jobResult && Date.now() - start < ttl);

  if (jobResult) {
    events.write({
      service: jobResult.service,
      clusterId: owner.clusterId,
      jobId,
      type: "jobStatusRequest",
      resultType: jobResult.resultType ?? undefined,
      status: jobResult.status,
    });
  } else {
    throw new JobPollTimeoutError(`Call did not resolve within ${ttl}ms`);
  }

  return jobResult;
};

export const getJob = async ({ clusterId, jobId }: { clusterId: string; jobId: string }) => {
  const [[job], blobs] = await Promise.all([
    data.db
      .select({
        id: data.jobs.id,
        clusterId: data.jobs.cluster_id,
        status: data.jobs.status,
        targetFn: data.jobs.target_fn,
        service: data.jobs.service,
        executingMachineId: data.jobs.executing_machine_id,
        targetArgs: data.jobs.target_args,
        result: data.jobs.result,
        resultType: data.jobs.result_type,
        createdAt: data.jobs.created_at,
        runId: data.jobs.workflow_id,
        runContext: data.jobs.run_context,
        authContext: data.jobs.auth_context,
        approvalRequested: data.jobs.approval_requested,
        approved: data.jobs.approved,
      })
      .from(data.jobs)
      .where(and(eq(data.jobs.id, jobId), eq(data.jobs.cluster_id, clusterId))),
    getBlobsForJobs({ clusterId, jobIds: [jobId] }),
  ]);

  if (!job) {
    return undefined;
  }

  return {
    ...job,
    blobs,
  };
};

export const getLatestJobsResultedByFunctionName = async ({
  clusterId,
  service,
  functionName,
  limit,
  resultType,
}: {
  clusterId: string;
  service: string;
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
        eq(data.jobs.service, service),
        eq(data.jobs.result_type, resultType)
      )
    )
    .orderBy(desc(data.jobs.created_at))
    .limit(limit);
};

export const getJobsForWorkflow = async ({
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
      service: data.jobs.service,
      resultType: data.jobs.result_type,
      createdAt: data.jobs.created_at,
      approvalRequested: data.jobs.approval_requested,
      approved: data.jobs.approved,
    })
    .from(data.jobs)
    .where(
      and(
        eq(data.jobs.cluster_id, clusterId),
        eq(data.jobs.workflow_id, runId),
        gt(data.jobs.id, after)
      )
    );
};

// Walks a json object and returns all the values
function walkJson(obj: unknown): string[] {
  if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) {
      return obj.flatMap(walkJson);
    } else {
      return Object.values(obj).flatMap(walkJson);
    }
  } else if (typeof obj === "string") {
    return [obj];
  }
  return [];
}

export const getJobReferences = async ({
  clusterId,
  runId,
  token,
  before,
}: {
  clusterId: string;
  runId: string;
  token: string;
  before: Date;
}) => {
  const jobs = await data.db
    .select({
      id: data.jobs.id,
      result: data.jobs.result,
      createdAt: data.jobs.created_at,
      status: data.jobs.status,
      targetFn: data.jobs.target_fn,
      service: data.jobs.service,
      executingMachineId: data.jobs.executing_machine_id,
    })
    .from(data.jobs)
    .where(
      and(
        eq(data.jobs.cluster_id, clusterId),
        eq(data.jobs.workflow_id, runId),
        lte(data.jobs.created_at, before)
      )
    );

  const withTokens = jobs.map(j => ({
    ...j,
    tokens: walkJson(packer.unpack(j.result ?? JSON.stringify({ value: "" }))).map(t => {
      const partial = t.includes(token);
      if (partial) {
        return {
          partial: true,
          exact: t === token,
        };
      } else {
        return null;
      }
    }),
  }));

  return withTokens.filter(j => j.tokens.some(t => t !== null));
};

const waitForPendingJobs = async ({
  clusterId,
  timeout,
  start,
  service,
}: {
  clusterId: string;
  timeout: number;
  start: number;
  service: string;
}): Promise<void> => {
  const hasPendingJobs = await data.db
    .execute<{ count: number }>(
      sql`
    SELECT COUNT(*) AS count
    FROM jobs
    WHERE status = 'pending'
      AND cluster_id = ${clusterId}
      AND service = ${service}
    LIMIT 1
  `
    )
    .then(r => Number(r.rows[0].count) > 0)
    .catch(() => true);

  if (hasPendingJobs) {
    return;
  }

  if (Date.now() - start > timeout) {
    return;
  }

  // wait for 500ms
  await new Promise(resolve => setTimeout(resolve, 500));
  return waitForPendingJobs({ clusterId, timeout, start, service });
};

export const pollJobs = async ({
  service,
  clusterId,
  machineId,
  limit,
  timeout = env.JOB_LONG_POLLING_TIMEOUT,
}: {
  service: string;
  clusterId: string;
  machineId: string;
  limit: number;
  timeout?: number;
}) => {
  await waitForPendingJobs({ clusterId, timeout, start: Date.now(), service });

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
           AND service = ${service}
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
      service,
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
  callId,
  clusterId,
}: {
  callId: string;
  clusterId: string;
}) {
  const [updated] = await data.db
    .update(data.jobs)
    .set({
      approval_requested: true,
    })
    .returning({
      callId: data.jobs.id,
      clusterId: data.jobs.cluster_id,
      runId: data.jobs.workflow_id,
      service: data.jobs.service,
      targetFn: data.jobs.target_fn,
    })
    .where(and(eq(data.jobs.id, callId), eq(data.jobs.cluster_id, clusterId)));

  if (updated.runId) {
    await notifyApprovalRequest(updated);
  }
}

export async function submitApproval({
  callId,
  clusterId,
  approved,
}: {
  callId: string;
  clusterId: string;
  approved: boolean;
}) {
  if (approved) {
    await data.db
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
          eq(data.jobs.id, callId),
          eq(data.jobs.cluster_id, clusterId),
          // Do not allow denying a job that has already been approved
          isNull(data.jobs.approved),
          eq(data.jobs.approval_requested, true)
        )
      );
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
        runId: data.jobs.workflow_id,
      })
      .where(
        and(
          eq(data.jobs.id, callId),
          eq(data.jobs.cluster_id, clusterId),
          // Do not allow denying a job that has already been approved
          isNull(data.jobs.approved),
          eq(data.jobs.approval_requested, true)
        )
      );

    if (updated?.runId) {
      await resumeRun({
        clusterId,
        id: updated.runId,
      });
    }
  }
}

export const start = () =>
  cron.registerCron(selfHealCalls, "self-heal-calls", { interval: 1000 * 5 }); // 5 seconds
