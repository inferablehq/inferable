import { ulid } from "ulid";
import { events } from "../observability/events";

/**
 * Creates a log for a workflow execution.
 *
 * @param clusterId - ID of the cluster
 * @param workflowExecutionId - ID of the workflow execution
 * @param status - Status of the log (info, warn, error)
 * @param data - Additional data for the log
 * @returns Log info with ID, status, and creation timestamp
 */
export const createWorkflowLog = async ({
  clusterId,
  workflowExecutionId,
  status,
  data,
}: {
  clusterId: string;
  workflowExecutionId: string;
  status: "info" | "warn" | "error";
  data: Record<string, unknown>;
}) => {
  // Create an event for this notification
  const eventId = ulid();

  events.write({
    type: "workflowLogCreated",
    clusterId,
    jobId: workflowExecutionId,
    meta: {
      status,
      data,
    },
  });

  return {
    id: eventId,
    status,
    workflowExecutionId,
    createdAt: new Date(),
  };
};
