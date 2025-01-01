import { InferSelectModel } from "drizzle-orm";
import * as jobs from "../jobs/jobs";
import { logger } from "../observability/logger";
import { packer } from "../packer";
import { getRunMetadata } from "./metadata";
import { getClusterBackgroundRun, Run } from "./workflows";
import { workflowMessages } from "../data";
import * as slack from "../integrations/slack";
import * as email from "../email";


export const notifyApprovalRequest = async ({
  callId,
  clusterId,
  runId,
  service,
  targetFn,
}: {
  callId: string;
  clusterId: string;
  runId: string;
  service: string;
  targetFn: string;
}) => {
  const metadata = await getRunMetadata({ clusterId, runId });
  await slack.handleApprovalRequest({ callId, clusterId, runId, service, targetFn, metadata });
};

export const notifyNewMessage = async ({
  message,
  metadata,
}: {
  message: {
    id: string;
    clusterId: string;
    runId: string;
    type: InferSelectModel<typeof workflowMessages>["type"];
    data: InferSelectModel<typeof workflowMessages>["data"];
  };
  metadata?: Record<string, string>;
}) => {
  await slack.handleNewRunMessage({ message, metadata });
  await email.handleNewRunMessage({ message, metadata });
};

export const notifyStatusChange = async ({
  run,
  status,
  result,
}: {
  run: Run;
  status: string;
  result?: unknown;
}) => {
  if (!run.onStatusChange) {
    return;
  }

  // Don't notify if the status hasn't changed
  if (run.status === status) {
    return;
  }

  // TODO: Support for webhooks
  const [resultService, resultFunction] = run.onStatusChange?.split("_") ?? [];

  let notify;

  if (!!resultService && !!resultFunction) {
    notify = async (payload: unknown) => {
      const { id } = await jobs.createJob({
        service: resultService,
        targetFn: resultFunction,
        targetArgs: packer.pack(payload),
        authContext: run.authContext,
        runContext: run.context,
        owner: {
          clusterId: run.clusterId,
        },
        runId: getClusterBackgroundRun(run.clusterId),
      });
      logger.info("Created job with run result", {
        jobId: id,
      });
    };
  }

  if (!notify) {
    logger.warn("Could not determine notification target", {
      onStatusChange: run.onStatusChange,
    });
    return;
  }

  try {
    const metadata = await getRunMetadata({
      clusterId: run.clusterId,
      runId: run.id,
    });

    const payload = {
      runId: run.id,
      status,
      metadata,
      result: result ?? null,
    };

    await notify(payload);
  } catch (error) {
    logger.error("Failed to notify status change", {
      error,
    });
  }
};
