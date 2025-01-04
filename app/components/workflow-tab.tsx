import { client } from "@/client/client";
import {
  SmallDeadGreenCircle,
  SmallDeadRedCircle,
  SmallLiveAmberCircle,
  SmallLiveBlueCircle,
  SmallLiveGreenCircle,
} from "@/components/circles";
import { Button } from "@/components/ui/button";
import { Workflow } from "@/lib/types";
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { formatRelative } from "date-fns";
import { truncate } from "lodash";
import {
  FileTextIcon,
  TestTubeIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TrashIcon,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

  const [templates, setTemplates] = useState<{ id: string; name: string }[]>(
    []
  );

  useEffect(() => {
    getToken()
      .then((token) => {
        return client.listAgents({
          headers: {
            authorization: `Bearer ${token}`,
          },
          params: {
            clusterId,
          },
        });
      })
      .then((results) => {
        if (results.status === 200) {
          setTemplates(results.body);
        } else {
          createErrorToast(results, "Failed to fetch Agents");
        }
      });
  }, [clusterId, getToken]);

  return (
    <div className="flex flex-col space-y-2">
      {workflows
        .sort((a, b) => (a.id > b.id ? -1 : 1))
        .map((workflow) => (
          <RunPill
            key={workflow.id}
            workflow={workflow}
            runId={runId as string | undefined}
            clusterId={clusterId}
            onGoToWorkflow={onGoToWorkflow}
            workflows={workflows}
            userId={userId ?? null}
            templates={templates}
            onDeleteWorkflow={deleteWorkflow}
            test={workflow.test}
          />
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
  depth = 0,
  userId,
  templates,
}: {
  workflow: Workflow;
  runId?: string;
  clusterId: string;
  onGoToWorkflow: (clusterId: string, runId: string) => void;
  workflows: Workflow[];
  depth?: number;
  userId: string | null;
  onDeleteWorkflow: (runId: string, clusterId: string) => void;
  test: boolean;
  templates: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <div
      key={workflow.id}
      className={`grid grid-cols-[20px_1fr] items-start hover:text-black border p-2 rounded-md shadow-sm
                    ${
                      runId === workflow.id
                        ? "bg-gray-100"
                        : "text-slate-600 bg-white"
                    } cursor-pointer mt-2 ${depth > 0 ? "opacity-90" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onGoToWorkflow(clusterId, workflow.id);
      }}
    >
      <div className="p-1">
        <div className="text-sm text-muted-foreground">
          {workflow.status ? statusToCircle[workflow.status] : workflow.status}
        </div>
      </div>
      <div>
        <span className="flex space-x-2 items-center">
          <p className="text-xs text-muted-foreground font-mono tracking-tighter">
            Created {userId === workflow.userId && "by you "}
            {formatRelative(
              new Date(workflow.createdAt).getTime(),
              new Date().getTime()
            )}
          </p>
        </span>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-sm font-medium leading-none break-word mt-1">
              {truncate(workflow.name, {
                length: 100,
              }) || "..."}{" "}
            </p>
            <div className="flex flex-wrap">
              {workflow.test && (
                <Tag
                  label={<TestTubeIcon className="h-3 w-3" />}
                  value=""
                  onClick={(e) => {
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
              {workflow.agentId && (
                <Tag
                  label={<FileTextIcon className="h-3 w-3" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(
                      `/clusters/${clusterId}/runs?filters=${encodeURIComponent(
                        JSON.stringify({
                          agentId: workflow.agentId,
                        })
                      )}`
                    );
                  }}
                  value={
                    templates.find((t) => t.id === workflow.agentId)?.name ??
                    "unknown"
                  }
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
          </div>
          <Button
            className="opacity-30 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteWorkflow(workflow.id, clusterId);
            }}
            size="icon"
            variant="ghost"
            asChild
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
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
      className="flex flex-col items-start text-xs mt-1 flex-wrap"
      onClick={onClick}
    >
      <div
        className={`flex space-x-1 bg-white border mt-1 py-1 px-2 rounded-sm text-gray-600 mr-1 mb-1 items-center h-8 ${
          onClick ? "hover:bg-gray-100" : ""
        }`}
      >
        <span className="text-gray-400 flex items-center h-full">{label}</span>
        {value && <span className="truncate text-ellipsis">{value}</span>}
      </div>
    </div>
  );
}
