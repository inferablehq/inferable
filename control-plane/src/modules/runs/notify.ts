import { InferSelectModel } from "drizzle-orm";
import * as jobs from "../jobs/jobs";
import { logger } from "../observability/logger";
import { packer } from "../packer";
import { getRunTags } from "./tags";
import { getClusterBackgroundRun } from "./";
import { runMessages, runs } from "../data";
import * as slack from "../integrations/slack";
import * as email from "../email";
import AsyncRetry from "async-retry";
import { onStatusChangeSchema } from "../contract";
import { z } from "zod";
import { resumeWorkflowExecution } from "../workflows/executions";

export const notifyApprovalRequest = async ({
  jobId,
  clusterId,
  runId,
  service,
  targetFn,
}: {
  jobId: string;
  clusterId: string;
  runId: string;
  service: string;
  targetFn: string;
}) => {
  const tags = await getRunTags({ clusterId, runId });
  await slack.handleApprovalRequest({ jobId, clusterId, runId, service, targetFn, tags });
  await email.handleApprovalRequest({ jobId, clusterId, runId, service, targetFn, tags });
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
  await slack.notifyNewMessage({ message, tags });
  await email.notifyNewMessage({ message, tags });
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
      }
    );
  } else if (onStatusChangeDefinition.type === "function") {
    const { id } = await jobs.createJob({
      service: onStatusChangeDefinition.function.service,
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
  } else if (onStatusChangeDefinition.type === "workflow") {
    const { jobId } = await resumeWorkflowExecution({
      clusterId: run.clusterId,
      workflowExecutionId: onStatusChangeDefinition.workflow.executionId,
    });

    logger.info("Resumed workflow execution", {
      jobId,
    });
  } else {
    throw new Error(`Unknown onStatusChange type: ${JSON.stringify(onStatusChangeDefinition)}`);
  }
};
