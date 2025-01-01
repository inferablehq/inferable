import { getJobsForWorkflow } from "./jobs/jobs";
import { getActivityForTimeline } from "./observability/events";
import { getRunMessagesForDisplay } from "./workflows/workflow-messages";
import { getRun } from "./workflows/workflows";

export const timeline = {
  getRunTimeline: async ({
    clusterId,
    runId,
    messagesAfter,
    activityAfter,
  }: {
    clusterId: string;
    runId: string;
    messagesAfter: string;
    activityAfter: string;
  }) => {
    let rowsCount = 0;
    const delay = 200;
    const timeout = 20_000;
    const startTime = Date.now();
    do {
      const [newMessages, newActivity] = await Promise.all([
        getRunMessagesForDisplay({
          clusterId,
          runId,
          after: messagesAfter,
        }),
        getActivityForTimeline({
          clusterId,
          runId,
          after: activityAfter,
        }),
      ]);

      rowsCount = newMessages.length + newActivity.length;

      await new Promise(resolve => setTimeout(resolve, delay));
    } while (rowsCount === 0 && Date.now() - startTime < timeout);

    const [messages, activity, jobs, workflow] = await Promise.all([
      getRunMessagesForDisplay({
        clusterId,
        runId,
        after: messagesAfter,
      }),
      getActivityForTimeline({
        clusterId,
        runId,
        after: activityAfter,
      }),
      getJobsForWorkflow({
        clusterId,
        runId,
      }),
      getRun({
        clusterId,
        runId,
      }),
    ]);

    return {
      messages,
      activity,
      jobs,
      workflow,
    };
  },
};
