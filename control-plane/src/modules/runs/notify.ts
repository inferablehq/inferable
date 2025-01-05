import { InferSelectModel } from "drizzle-orm";
import * as jobs from "../jobs/jobs";
import { logger } from "../observability/logger";
import { packer } from "../packer";
import { getRunTags } from "./tags";
import { getClusterBackgroundRun, Run } from "./";
import { runMessages } from "../data";
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
  const tags = await getRunTags({ clusterId, runId });
  await slack.handleApprovalRequest({ callId, clusterId, runId, service, targetFn, tags });
};

export const notifyNewMessage = async ({
  message,
  tags,
}: {
  message: {
    id: string;
    clusterId: string;
    runId: string;
    type: InferSelectModel<typeof runMessages>["type"];
    data: InferSelectModel<typeof runMessages>["data"];
  };
  tags?: Record<string, string>;
}) => {
  await slack.handleNewRunMessage({ message, tags });
  await email.handleNewRunMessage({ message, tags });
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
    const tags = await getRunTags({
      clusterId: run.clusterId,
      runId: run.id,
    });

    const payload = {
      runId: run.id,
      status,
      tags,
      result: result ?? null,
    };

    await notify(payload);
  } catch (error) {
    logger.error("Failed to notify status change", {
      error,
    });
  }
};
