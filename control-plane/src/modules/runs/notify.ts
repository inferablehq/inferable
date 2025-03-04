import { InferSelectModel } from "drizzle-orm";
import * as jobs from "../jobs/jobs";
import { logger } from "../observability/logger";
import { packer } from "../../utilities/packer";
import { getRunTags } from "./tags";
import { getClusterBackgroundRun } from "./";
import { runMessages, runs } from "../data";
import * as slack from "../integrations/slack";
import AsyncRetry from "async-retry";
import { onStatusChangeSchema } from "../contract";
import { z } from "zod";
import { resumeWorkflowExecution } from "../workflows/executions";
import { notificationSchema } from "../contract";
import { events } from "../observability/events";

export const notifyApprovalRequest = async ({
  jobId,
  clusterId,
  targetFn,
  runId,
  notification,
}: {
  jobId: string;
  clusterId: string;
  targetFn: string;
  runId?: string;
  notification?: z.infer<typeof notificationSchema>;
}) => {
  // If the approval's Job is within a Run, check if the Run is associated with a Slack thread.
  if (runId) {
    const tags = await getRunTags({ clusterId, runId });
    if (tags?.[slack.THREAD_META_KEY] && tags?.[slack.CHANNEL_META_KEY]) {
      const notification = {
        destination: {
          type: "slack" as const,
          channelId: tags[slack.CHANNEL_META_KEY],
          threadId: tags[slack.THREAD_META_KEY],
        },
      };

      await slack.notifyApprovalRequest({
        jobId,
        clusterId,
        targetFn,
        notification,
      });

      events.write({
        type: "notificationSent",
        jobId,
        clusterId,
        runId,
        meta: {
          notification,
        },
      });
    }
  }

  // An approval may have an explcit `notification` object.
  if (notification && notification.destination?.type === "slack") {
    await slack.notifyApprovalRequest({
      jobId,
      clusterId,
      targetFn,
      notification,
    });

    events.write({
      type: "notificationSent",
      jobId,
      clusterId,
      runId,
      meta: {
        notification,
      },
    });
  }
};

export const notifyNewRunMessage = async ({
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
  // Check if the Run is associated with a Slack thread
  if (tags?.[slack.THREAD_META_KEY] && tags?.[slack.CHANNEL_META_KEY]) {
    await slack.notifyNewRunMessage({
      message,
      destination: {
        channelId: tags[slack.CHANNEL_META_KEY],
        threadId: tags[slack.THREAD_META_KEY],
      },
    });
  }
};

export const notifyStatusChange = async ({
  run,
  status,
  result,
}: {
  run: {
    id: string;
    clusterId: string;
    onStatusChange: z.infer<typeof onStatusChangeSchema> | null;
    status: string;
    authContext: unknown;
    context: unknown;
  };
  status: InferSelectModel<typeof runs>["status"];
  result?: unknown;
}) => {
  if (!run.onStatusChange) {
    return;
  }

  // Don't notify if the status hasn't changed
  if (run.status === status) {
    return;
  }

  // Don't notify if the status is not in the allowed list
  if (!run.onStatusChange.statuses.includes(status)) {
    return;
  }

  const onStatusChangeDefinition = run.onStatusChange;

  async function getRunPayload() {
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

    return payload;
  }

  if (onStatusChangeDefinition.type === "webhook") {
    await AsyncRetry(
      async (_, attempt: number) => {
        logger.info("Sending status change webhook", {
          url: onStatusChangeDefinition.webhook,
          attempt,
        });

        return await fetch(onStatusChangeDefinition.webhook, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(await getRunPayload()),
        });
      },
      {
        retries: 5,
      },
    );
  } else if (onStatusChangeDefinition.type === "function") {
    logger.warn(
      "OnStatusChange handler registerd with deprecated function type",
    );
    const { id } = await jobs.createJobV2({
      targetFn: onStatusChangeDefinition.function.function,
      targetArgs: packer.pack(await getRunPayload()),
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
  } else if (onStatusChangeDefinition.type === "tool") {
    const { id } = await jobs.createJobV2({
      targetFn: onStatusChangeDefinition.tool,
      targetArgs: packer.pack(await getRunPayload()),
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
  } else if (onStatusChangeDefinition.type === "workflow") {
    const { jobId } = await resumeWorkflowExecution({
      clusterId: run.clusterId,
      id: onStatusChangeDefinition.workflow.executionId,
    });

    if (jobId) {
      logger.info("Resumed workflow execution", {
        jobId,
      });
    } else {
      logger.warn("Failed to resume workflow execution", {
        workflowExecutionId: onStatusChangeDefinition.workflow.executionId,
      });
    }
  } else {
    throw new Error(
      `Unknown onStatusChange type: ${JSON.stringify(onStatusChangeDefinition)}`,
    );
  }
};
