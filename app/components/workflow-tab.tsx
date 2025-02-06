import { client } from "@/client/client";
import {
  SmallDeadGreenCircle,
  SmallDeadRedCircle,
  SmallLiveAmberCircle,
  SmallLiveBlueCircle,
  SmallLiveGreenCircle,
} from "@/components/circles";
import { Workflow } from "@/lib/types";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { formatRelative } from "date-fns";
import { TestTubeIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import toast from "react-hot-toast";

const statusToCircle: {
  [key: string]: React.ReactNode;
} = {
  pending: <SmallLiveGreenCircle />,
  running: <SmallLiveBlueCircle />,
  paused: <SmallLiveAmberCircle />,
  done: <SmallDeadGreenCircle />,
  failed: <SmallDeadRedCircle />,
};

type WorkflowGroup = {
  executionId: string | null;
  workflowName: string | null;
  workflowVersion: number | null;
  workflows: Workflow[];
};

function groupWorkflowsByExecution(workflows: Workflow[]): WorkflowGroup[] {
  const groups: { [key: string]: {
    workflows: Workflow[];
    workflowName: string | null;
    workflowVersion: number | null;
  } } = {};

  workflows.forEach(workflow => {
    const executionId = workflow.workflowExecutionId;
    if (executionId) {
      if (!groups[executionId]) {
        groups[executionId] = {
          workflows: [],
          workflowName: workflow.workflowName ?? null,
          workflowVersion: workflow.workflowVersion ?? null
        };
      }
      groups[executionId].workflows.push(workflow);
    } else {
      // Create a separate group for each standalone run
      groups[`standalone-${workflow.id}`] = {
        workflows: [workflow],
        workflowName: null,
        workflowVersion: null
      };
    }
  });

  const result: WorkflowGroup[] = Object.entries(groups).map(([key, { workflows, workflowName, workflowVersion }]) => ({
    executionId: key.startsWith('standalone-') ? null : key,
    workflowName,
    workflowVersion,
    workflows: workflows.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)),
  }));

  return result.sort((a, b) => {
    const latestA = a.workflows[0]?.createdAt ?? '';
    const latestB = b.workflows[0]?.createdAt ?? '';
    return latestA > latestB ? -1 : 1;
  });
}

export function RunTab({
  clusterId,
  workflows,
  onGoToWorkflow,
  onRefetchWorkflows,
  onGoToCluster,
}: {
  clusterId: string;
  workflows: Workflow[];
  onGoToWorkflow: (clusterId: string, runId: string) => void;
  onRefetchWorkflows: () => Promise<void>;
  onGoToCluster: (clusterId: string) => void;
}) {
  const { runId } = useParams() ?? {};
  const { getToken, userId } = useAuth();

  const deleteWorkflow = useCallback(
    async (w: string, c: string) => {
      if (window.confirm("Are you sure you want to delete this run?")) {
        const id = toast.loading("Deleting run");

        const result = await client.deleteRun({
          headers: {
            authorization: `Bearer ${await getToken()}`,
          },
          params: {
            clusterId: c,
            runId: w,
          },
        });

        if (result.status === 204) {
          await onRefetchWorkflows();
          toast.dismiss(id);
          toast.success("Workflow deleted");

          if (runId === w) {
            onGoToCluster(c);
          }
        } else {
          createErrorToast(result, "Failed to delete run");
        }
      }
    },
    [onRefetchWorkflows, onGoToCluster, runId, getToken]
  );

  const workflowGroups = groupWorkflowsByExecution(workflows);

  return (
    <div className="flex flex-col space-y-2 w-full">
      {workflowGroups.map(group => (
        <div
          key={group.executionId ?? 'ungrouped'}
          className="border rounded-lg overflow-hidden w-full"
        >
          <div className="bg-slate-100 border-b w-full">
            <div className="px-4 py-2 border-b border-slate-200">
              <div className="uppercase tracking-wider text-slate-500 font-medium text-xs">
                {group.executionId ? 'Workflow' : 'Run'}
              </div>
            </div>
            <div className="px-4 py-2 space-y-1 text-xs font-mono">
              {group.executionId ? (
                <>
                  {group.workflowName && (
                    <div className="flex items-baseline">
                      <span className="text-blue-600 w-24 shrink-0">name:</span>
                      <span className="text-slate-900">
                        {group.workflowName.length > 40 ? group.workflowName.slice(0, 40) + '...' : group.workflowName}
                      </span>
                    </div>
                  )}
                  {group.workflowVersion && (
                    <div className="flex items-baseline">
                      <span className="text-blue-600 w-24 shrink-0">version:</span>
                      <span className="text-slate-600">v{group.workflowVersion}</span>
                    </div>
                  )}
                  <div className="flex items-baseline">
                    <span className="text-blue-600 w-24 shrink-0">execution_id:</span>
                    <span className="text-slate-600">
                      {group.executionId.length > 40 ? group.executionId.slice(0, 40) + '...' : group.executionId}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-baseline">
                  <span className="text-blue-600 w-24 shrink-0">run_id:</span>
                  <span className="text-slate-600">
                    {group.workflows[0].id.length > 40 ? group.workflows[0].id.slice(0, 40) + '...' : group.workflows[0].id}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-stretch divide-y p-3 w-full">
            {group.workflows.map((workflow) => (
              <RunPill
                key={workflow.id}
                workflow={workflow}
                runId={runId as string | undefined}
                clusterId={clusterId}
                onGoToWorkflow={onGoToWorkflow}
                workflows={workflows}
                userId={userId ?? null}
                onDeleteWorkflow={deleteWorkflow}
                test={workflow.test}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RunPill({
  workflow,
  runId,
  onGoToWorkflow,
  onDeleteWorkflow,
  clusterId,
  userId,
}: {
  workflow: Workflow;
  runId?: string;
  clusterId: string;
  onGoToWorkflow: (clusterId: string, runId: string) => void;
  workflows: Workflow[];
  userId: string | null;
  onDeleteWorkflow: (runId: string, clusterId: string) => void;
  test: boolean;
}) {
  const router = useRouter();
  return (
    <div
      key={workflow.id}
      className={`
        grid grid-cols-[20px_1fr] items-start hover:bg-gray-50/50 py-3 first:pt-0 last:pb-0
        relative pl-4 cursor-pointer rounded-md w-full
        ${runId === workflow.id
          ? "text-slate-900 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-blue-500"
          : "text-slate-600"
        }
      `}
      onClick={e => {
        e.stopPropagation();
        onGoToWorkflow(clusterId, workflow.id);
      }}
    >
      <div className="p-1">
        <div className="text-sm">
          {workflow.status ? statusToCircle[workflow.status] : workflow.status}
        </div>
      </div>
      <div className="min-w-0 pr-4">
        <span className="flex space-x-2 items-center">
          <p className="text-xs text-muted-foreground font-mono tracking-tighter truncate">
            Created {userId === workflow.userId && "by you "}
            {formatRelative(new Date(workflow.createdAt).getTime(), new Date().getTime())}
          </p>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none py-0.5 w-[300px] truncate">
            {workflow.name}
          </p>
          <div className="flex flex-wrap mt-1 gap-1">
            {workflow.test && (
              <Tag
                label={<TestTubeIcon className="h-3 w-3" />}
                value=""
                onClick={e => {
                  e.stopPropagation();
                  router.push(
                    `/clusters/${clusterId}/runs?filters=${encodeURIComponent(
                      JSON.stringify({
                        test: true,
                      })
                    )}`
                  );
                }}
              />
            )}
            {workflow.feedbackScore !== null && (
              <Tag
                label={
                  workflow.feedbackScore > 0 ? (
                    <ThumbsUpIcon className="h-3 w-3" />
                  ) : (
                    <ThumbsDownIcon className="h-3 w-3" />
                  )
                }
                value={""}
              />
            )}
          </div>
          <button
            onClick={e => {
              e.stopPropagation();
              onDeleteWorkflow(workflow.id, clusterId);
            }}
            className="mt-1 text-xs text-slate-400 hover:text-red-500 hover:underline"
          >
            delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Tag({
  label,
  value,
  onClick,
}: {
  label: React.ReactNode;
  value: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="inline-block mr-1 mt-0.5"
      onClick={onClick}
    >
      <div
        className={`
          inline-flex items-center h-5 px-1.5
          bg-gray-50 border rounded-md text-xs
          ${onClick ? "cursor-pointer hover:bg-gray-100 hover:border-gray-300" : ""}
        `}
      >
        <span className="text-gray-500 flex items-center">
          {label}
        </span>
        {value && (
          <>
            <span className="mx-1 text-gray-400">=</span>
            <span className="text-gray-700 font-medium truncate max-w-[150px]">
              {value}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
