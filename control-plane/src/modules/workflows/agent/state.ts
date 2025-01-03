import { StateGraphArgs } from "@langchain/langgraph";
import { InferSelectModel } from "drizzle-orm";
import { UnifiedMessage } from "../../contract";
import { RunMessageMetadata, workflows } from "../../data";
import { Run } from "../workflows";

export type WorkflowAgentStateMessage = UnifiedMessage & {
  persisted?: true;
  clusterId: string;
  runId: string;
  metadata?: RunMessageMetadata;
};

export type WorkflowAgentState = {
  status: InferSelectModel<typeof workflows>["status"];
  messages: WorkflowAgentStateMessage[];
  additionalContext?: string;
  workflow: Run;
  waitingJobs: string[];
  allAvailableTools: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
};

export const createStateGraphChannels = ({
  workflow,
  additionalContext,
  allAvailableTools,
}: {
  workflow: Run;
  allAvailableTools: string[];
  additionalContext?: string;
}): StateGraphArgs<WorkflowAgentState>["channels"] => {
  return {
    // Accumulate messages
    messages: {
      reducer: (a, b) => [...a, ...b],
      default: () => [],
    },

    // Workflow state is immutable
    workflow: {
      reducer: () => workflow,
      default: () => workflow,
    },

    // Always take the latest status
    status: {
      reducer: (_a, b) => b,
      default: () => "pending",
    },

    // Accumulate waiting jobs
    waitingJobs: {
      reducer: (a?: string[], b?: string[]) => {
        if (a == undefined || b == undefined) {
          return [];
        }

        return [...a, ...b];
      },
      default: () => [],
    },

    // Additional context is immutable
    additionalContext: {
      reducer: () => additionalContext,
      default: () => additionalContext,
    },

    // All available tool names. immutable.
    allAvailableTools: {
      reducer: () => allAvailableTools,
      default: () => allAvailableTools,
    },

    // Accumulate results
    result: {
      reducer: (a, b) => ({
        ...a,
        ...b,
      }),
    },
  };
};
