import { getJobsForRun } from "./jobs/jobs";
import { getEventsForRunTimeline } from "./observability/events";
import { getRunMessagesForDisplay } from "./runs/messages";
import { getRun, getRunDetails } from "./runs";

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
    const delay = 500;
    const timeout = 20_000;
    const startTime = Date.now();
    do {
      const [newMessages, newActivity] = await Promise.all([
        getRunMessagesForDisplay({
          clusterId,
          runId,
          after: messagesAfter,
        }),
        getEventsForRunTimeline({
          clusterId,
          runId,
          after: activityAfter,
        }),
      ]);

      rowsCount = newMessages.length + newActivity.length;

      await new Promise(resolve => setTimeout(resolve, delay));
    } while (rowsCount === 0 && Date.now() - startTime < timeout);

    const [messages, activity, jobs, run] = await Promise.all([
      getRunMessagesForDisplay({
        clusterId,
        runId,
        after: messagesAfter,
      }),
      getEventsForRunTimeline({
        clusterId,
        runId,
        after: activityAfter,
      }),
      getJobsForRun({
        clusterId,
        runId,
      }),
      getRunDetails({
        clusterId,
        runId,
      }),
    ]);

    return {
      messages,
      activity,
      jobs,
      run,
    };
  },
};
