import { client } from "@/client/client";
import {
  SmallDeadGreenCircle,
  SmallDeadRedCircle,
  SmallLiveAmberCircle,
  SmallLiveBlueCircle,
  SmallLiveGreenCircle,
} from "@/components/circles";
import { Run } from "@/lib/types";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { formatRelative } from "date-fns";
import {
  Clock,
  PlusIcon,
  TestTubeIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import toast from "react-hot-toast";
import { Button } from "./ui/button";

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
  runs,
  onGoToRun,
  onRefetchRuns,
  onGoToCluster,
}: {
  clusterId: string;
  runs: Run[];
  onGoToRun: (clusterId: string, runId: string) => void;
  onRefetchRuns: () => Promise<void>;
  onGoToCluster: (clusterId: string) => void;
}) {
  const { runId } = useParams() ?? {};
  const { getToken, userId } = useAuth();
  const router = useRouter();

  const deleteRun = useCallback(
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
          await onRefetchRuns();
          toast.dismiss(id);
          toast.success("Run deleted");

          if (runId === w) {
            onGoToCluster(c);
          }
        } else {
          createErrorToast(result, "Failed to delete run");
        }
      }
    },
    [onRefetchRuns, onGoToCluster, runId, getToken],
  );

  // Sort runs by creation date, newest first
  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
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
            <div className="text-sm font-medium">Conversations</div>
            <div className="text-xs text-muted-foreground font-mono">
              {runs.length} conversations
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
          New Conversation
        </Button>
      </div>
      <div className="overflow-y-auto">
        <div className="divide-y divide-border">
          {sortedRuns.map((run) => (
            <div
              key={run.id}
              className={cn(
                "px-4 py-3 flex items-start gap-4 hover:bg-muted/50 transition-colors cursor-pointer",
                runId === run.id && "bg-muted/50",
              )}
              onClick={() => onGoToRun(clusterId, run.id)}
            >
              <div className="shrink-0 font-mono text-xs text-muted-foreground">
                {new Date(run.createdAt).toLocaleTimeString("en-US", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
              <div className="flex-1 min-w-0 max-w-sm">
                <div className="flex items-center gap-2">
                  {statusToCircle[run.status || "pending"]}
                  <span className="text-sm font-medium *:">{run.name}</span>
                  {run.test && (
                    <div className="px-1.5 py-0.5 bg-muted rounded text-xs flex items-center gap-1">
                      <TestTubeIcon className="w-3 h-3" />
                      <span>Test</span>
                    </div>
                  )}
                  {run.feedbackScore !== null && (
                    <div className="px-1.5 py-0.5 bg-muted rounded text-xs flex items-center gap-1">
                      {run.feedbackScore > 0 ? (
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
                    Created {userId === run.userId && "by you "}
                    {formatRelative(new Date(run.createdAt), new Date())}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRun(run.id, clusterId);
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
