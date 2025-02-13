import { client } from "@/client/client";
import {
  SmallDeadGreenCircle,
  SmallDeadRedCircle,
  SmallLiveAmberCircle,
  SmallLiveBlueCircle,
  SmallLiveGreenCircle,
} from "@/components/circles";
import { Run } from "@/lib/types";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { formatRelative } from "date-fns";
import {
  TestTubeIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  WorkflowIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import toast from "react-hot-toast";
import { Button } from "./ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";

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
  workflows: Run[];
};

function groupWorkflowsByExecution(workflows: Run[]): WorkflowGroup[] {
  const groups: { [key: string]: WorkflowGroup } = {};

  workflows.forEach(workflow => {
    const executionId = workflow.workflowExecutionId;

    if (executionId) {
      if (!groups[executionId]) {
        groups[executionId] = {
          executionId,
          workflowName: workflow.workflowName,
          workflowVersion: workflow.workflowVersion,
          workflows: [],
        };
      }
      groups[executionId].workflows.push(workflow);
    } else {
      // Create a separate group for standalone runs
      const standaloneKey = `standalone-${workflow.id}`;
      groups[standaloneKey] = {
        executionId: null,
        workflowName: null,
        workflowVersion: null,
        workflows: [workflow],
      };
    }
  });

  return Object.values(groups).sort((a, b) => {
    const latestA = a.workflows[0]?.createdAt ?? "";
    const latestB = b.workflows[0]?.createdAt ?? "";
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
  workflows: Run[];
  onGoToWorkflow: (clusterId: string, runId: string) => void;
  onRefetchWorkflows: () => Promise<void>;
  onGoToCluster: (clusterId: string) => void;
}) {
  const { runId } = useParams() ?? {};
  const { getToken, userId } = useAuth();
  const router = useRouter();

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
      {workflowGroups.map((group, index) =>
        group.executionId ? (
          <Accordion key={group.executionId} type="multiple" defaultValue={[]}>
            <AccordionItem
              value={group.executionId}
              className="border rounded-lg overflow-hidden w-full"
            >
              <AccordionTrigger
                className="px-4 py-2 bg-slate-100 border-b border-slate-200 hover:bg-slate-50 no-underline"
                onClick={e => {
                  e.stopPropagation();
                }}
              >
                <div className="flex items-center space-x-2 w-full">
                  <div className="uppercase tracking-wider text-slate-500 font-medium text-xs">
                    Workflow ({group.workflows.length} runs)
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-0">
                <div className="flex flex-col items-stretch divide-y p-3 w-full">
                  <div className="flex justify-between items-center pb-3 border-b">
                    <div className="flex items-center space-x-2">
                      <WorkflowIcon className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium">
                        {group.workflowName}
                        {group.workflowVersion && ` v${group.workflowVersion}`}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        router.push(
                          `/clusters/${clusterId}/workflows/${group.workflowName}/${group.executionId}`
                        );
                      }}
                    >
                      Workflow
                      <ExternalLinkIcon className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                  {group.workflows.map(workflow => (
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : (
          group.workflows.map(workflow => (
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
          ))
        )
      )}
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
  workflow: Run;
  runId?: string;
  clusterId: string;
  onGoToWorkflow: (clusterId: string, runId: string) => void;
  workflows: Run[];
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
        ${
          runId === workflow.id
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
    <div className="inline-block mr-1 mt-0.5" onClick={onClick}>
      <div
        className={`
          inline-flex items-center h-5 px-1.5
          bg-gray-50 border rounded-md text-xs
          ${onClick ? "cursor-pointer hover:bg-gray-100 hover:border-gray-300" : ""}
        `}
      >
        <span className="text-gray-500 flex items-center">{label}</span>
        {value && (
          <>
            <span className="mx-1 text-gray-400">=</span>
            <span className="text-gray-700 font-medium truncate max-w-[150px]">{value}</span>
          </>
        )}
      </div>
    </div>
  );
}
