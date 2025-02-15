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
  Bot,
  Clock,
  Terminal,
  Trash2Icon,
  PlusIcon,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import toast from "react-hot-toast";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

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

  // Sort workflows by creation date, newest first
  const sortedWorkflows = [...workflows].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const pathname = usePathname();

  return (
    <div className="flex-1 overflow-hidden rounded-sm border bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium">Runs</div>
            <div className="text-xs text-muted-foreground font-mono">
              {workflows.length} runs
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => router.push(`/clusters/${clusterId}/runs`)}
          disabled={pathname?.endsWith("/runs")}
          className="gap-2"
        >
          <PlusIcon className="h-4 w-4" />
          Start a conversation
        </Button>
      </div>
      <div className="overflow-y-auto">
        <div className="divide-y divide-border">
          {sortedWorkflows.map((workflow) => (
            <div
              key={workflow.id}
              className={cn(
                "px-4 py-3 flex items-start gap-4 hover:bg-muted/50 transition-colors cursor-pointer",
                runId === workflow.id && "bg-muted/50"
              )}
              onClick={() => onGoToWorkflow(clusterId, workflow.id)}
            >
              <div className="shrink-0 font-mono text-xs text-muted-foreground">
                {new Date(workflow.createdAt).toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "p-1 rounded",
                    workflow.status === "failed" ? "bg-red-100" :
                    workflow.status === "done" ? "bg-green-100" : "bg-blue-100"
                  )}>
                    <Bot className={cn(
                      "w-3.5 h-3.5",
                      workflow.status === "failed" ? "text-red-700" :
                      workflow.status === "done" ? "text-green-700" : "text-blue-700"
                    )} />
                  </div>
                  <span className="text-sm font-medium">{workflow.name}</span>
                  {workflow.test && (
                    <div className="px-1.5 py-0.5 bg-muted rounded text-xs flex items-center gap-1">
                      <TestTubeIcon className="w-3 h-3" />
                      <span>Test</span>
                    </div>
                  )}
                  {workflow.feedbackScore !== null && (
                    <div className="px-1.5 py-0.5 bg-muted rounded text-xs flex items-center gap-1">
                      {workflow.feedbackScore > 0 ? (
                        <ThumbsUpIcon className="w-3 h-3" />
                      ) : (
                        <ThumbsDownIcon className="w-3 h-3" />
                      )}
                      <span>Feedback</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    Created {userId === workflow.userId && "by you "}
                    {formatRelative(new Date(workflow.createdAt), new Date())}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWorkflow(workflow.id, clusterId);
                    }}
                  >
                    <Trash2Icon className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
