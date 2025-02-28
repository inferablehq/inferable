"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { ReadOnlyJSON } from "@/components/read-only-json";
import { Run } from "@/components/run";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { formatDistance, formatRelative } from "date-fns";
import {
  AlertCircle,
  Ban,
  Bot,
  Check,
  ChevronRight,
  CircleChevronRight,
  Clock,
  MessageCircle,
  MessageCircleWarning,
  Pause,
  PlayCircle,
  RotateCcw,
  ServerIcon,
  Terminal,
  Timer,
  Workflow,
  Zap,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

type Node = {
  id: string;
  time: Date;
  title: string;
  tooltip?: string;
  label?: string;
  color?: string;
  icon?: React.ReactNode;
  iconBackground?: string;
  interactive?: boolean;
  result?: any;
};

const eventToNode = (
  event: ClientInferResponseBody<
    typeof contract.getWorkflowExecutionTimeline,
    200
  >["events"][number]
): Node | null => {
  const base = {
    id: event.id,
    time: new Date(event.createdAt),
    interactive: false,
  };

  switch (event.type) {
    case "jobRecovered": {
      return {
        ...base,
        title: "Workflow Recovered",
        tooltip: "The Workflow will be retried after stalling.",
        ...(event.machineId && { label: event.machineId }),
        icon: <RotateCcw className="w-3.5 h-3.5" />,
        iconBackground: "bg-indigo-100 text-indigo-700",
      };
    }
    case "jobStalled": {
      return {
        ...base,
        title: "Workflow Stalled",
        tooltip:
          "The Workflow handler did not resolve within the expected time. Timeout can be adjusted with `config.timeoutSeconds`.",
        ...(event.machineId && { label: event.machineId }),
        icon: <Timer className="w-3.5 h-3.5" />,
        iconBackground: "bg-orange-100 text-orange-700",
      };
    }
    case "jobStalledTooManyTimes": {
      return {
        ...base,
        title: "Workflow Stalled Too Many Times",
        tooltip:
          "The Workflow stalled too many times and was failed. Reties can be adjusted with `config.retryCountOnStall`.",
        ...(event.machineId && { label: event.machineId }),
        icon: <AlertCircle className="w-3.5 h-3.5" />,
        iconBackground: "bg-red-100 text-red-700",
      };
    }
    case "jobAcknowledged": {
      return {
        ...base,
        title: "Machine Acknowledged",
        tooltip: "The Workflow was picked up by a Machine for processing",
        ...(event.machineId && { label: event.machineId }),
        icon: <ServerIcon className="w-3.5 h-3.5" />,
        iconBackground: "bg-sky-100 text-sky-700",
      };
    }
    case "jobResulted":
    case "functionResulted": {
      if (event.resultType === "resolution") {
        return {
          ...base,
          title: "Workflow Completed",
          tooltip: "Workflow execution finished successfully",
          color: "text-emerald-700",
          icon: <Check className="w-3.5 h-3.5" />,
          iconBackground: "bg-emerald-100 text-emerald-700",
        };
      }

      return {
        ...base,
        title: "Workflow Failed",
        tooltip: "Workflow handler produced an error",
        color: "text-red-700",
        icon: <AlertCircle className="w-3.5 h-3.5" />,
        iconBackground: "bg-red-100 text-red-700",
      };
    }
    case "jobCreated": {
      return {
        ...base,
        title: "Workflow Triggered",
        icon: <PlayCircle className="w-3.5 h-3.5" />,
        iconBackground: "bg-violet-100 text-violet-700",
      };
    }
    case "approvalRequested": {
      return {
        ...base,
        tooltip: "The Workflow is waiting for approval",
        title: "Approval Requested",
        icon: <Pause className="w-3.5 h-3.5" />,
        iconBackground: "bg-amber-100 text-amber-700",
      };
    }
    case "approvalGranted": {
      return {
        ...base,
        title: "Approval Granted",
        tooltip: "The Workflow was approved and will continue",
        color: "text-emerald-700",
        icon: <Check className="w-3.5 h-3.5" />,
        iconBackground: "bg-emerald-100 text-emerald-700",
      };
    }
    case "approvalDenied": {
      return {
        ...base,
        title: "Approval Denied",
        tooltip: "The Workflow was denied and will not continue",
        color: "text-red-700",
        icon: <Ban className="w-3.5 h-3.5" />,
        iconBackground: "bg-red-100 text-red-700",
      };
    }
    case "notificationSent": {
      return {
        ...base,
        title: "A notification was sent",
        icon: <MessageCircle className="w-3.5 h-3.5" />,
        iconBackground: "bg-teal-100 text-teal-700",
      };
    }
    case "notificationFailed": {
      return {
        ...base,
        title: "A notification failed to send",
        icon: <MessageCircleWarning className="w-3.5 h-3.5" />,
        iconBackground: "bg-rose-100 text-rose-700",
      };
    }
    case "workflowLogCreated": {
      const { status, data } = event.meta;
      const { message, ...rest } = data;

      const hasData = Object.keys(rest).length > 0;

      const icon = <CircleChevronRight className="w-3.5 h-3.5" />;

      switch (status) {
        case "info":
          return {
            ...base,
            icon,
            iconBackground: "bg-sky-100 text-sky-700",
            ...(message && { tooltip: message }),
            result: hasData ? rest : undefined,
          };
        case "warn":
          return {
            ...base,
            icon,
            iconBackground: "bg-amber-100 text-amber-700",
            ...(message && { tooltip: message }),
            result: hasData ? rest : undefined,
          };
        case "error":
          return {
            ...base,
            icon,
            iconBackground: "bg-rose-100 text-rose-700",
            ...(message && { tooltip: message }),
            result: hasData ? rest : undefined,
          };
        default: {
          return null;
        }
      }
    }
    default: {
      return null;
    }
  }
};

const runToNode = (
  run: ClientInferResponseBody<typeof contract.getWorkflowExecutionTimeline, 200>["runs"][number]
): Node => {
  return {
    id: run.id,
    title: run.type === "single-step" ? "Single Step Agent" : "Multi Step Agent",
    label: run.name,
    tooltip: "An agent run was triggered",
    time: new Date(run.createdAt),
    color: run.status === "failed" ? "text-rose-700" : undefined,
    icon: <Bot className="w-3.5 h-3.5" />,
    iconBackground:
      run.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700",
    interactive: true,
  };
};

function WorkflowEvent({ node, onClick }: { node: Node & { result?: any }; onClick?: () => void }) {
  return (
    <div
      className={cn(
        "px-6 py-4 flex items-start gap-4 relative group",
        "before:absolute before:left-[2.25rem] before:top-0 before:bottom-0 before:w-px before:bg-border",
        "last:before:hidden",
        node.interactive && [
          "cursor-pointer hover:bg-muted/50 transition-colors",
          "after:absolute after:inset-0 after:pointer-events-none after:border after:border-transparent after:hover:border-border/60 after:rounded-sm after:transition-colors",
        ]
      )}
      onClick={onClick}
    >
      {node.time && (
        <div className="shrink-0 text-xs text-muted-foreground/60 absolute right-6 top-4">
          {formatRelative(node.time, new Date())}
        </div>
      )}
      <div className={cn("flex items-start gap-4 max-w-[calc(100%-8rem)]", node.color)}>
        <div className={cn("p-1.5 rounded-full shrink-0 z-10", node.iconBackground)}>
          {node.icon}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold">{node.title}</span>
            {node.label && (
              <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">{node.label}</code>
            )}
            {node.interactive && (
              <span className="text-xs text-muted-foreground/80 flex items-center gap-1 group-hover:text-primary transition-colors">
                View details
                <ChevronRight className="w-3 h-3" />
              </span>
            )}
          </div>
          {node.tooltip && <div className="text-sm text-muted-foreground">{node.tooltip}</div>}
          {node.result && (
            <div className="mt-3 bg-muted rounded-lg p-4">
              {typeof node.result === "object" ? (
                <ReadOnlyJSON json={node.result} />
              ) : (
                <span className="text-sm font-mono">{JSON.stringify(node.result)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useTimelineParser(
  timeline: ClientInferResponseBody<typeof contract.getWorkflowExecutionTimeline> | undefined
) {
  const status = !timeline
    ? "pending"
    : timeline.execution.job.resultType === "rejection"
      ? "failure"
      : timeline.execution.job.status;

  const parsedData = React.useMemo(() => {
    if (!timeline) return { result: null, input: null };

    const parseJSON = (str: string | null) => {
      if (!str) return null;
      try {
        const parsed = JSON.parse(str);
        return Object.keys(parsed).length > 0 ? parsed : str;
      } catch {
        return str;
      }
    };

    return {
      result: parseJSON(timeline.execution.job.result),
      input: parseJSON(timeline.execution.job.targetArgs),
    };
  }, [timeline]);

  return {
    status,
    ...parsedData,
  };
}

export default function WorkflowExecutionDetailsPage({
  params,
}: {
  params: {
    clusterId: string;
    workflowName: string;
    executionId: string;
  };
}) {
  const { getToken } = useAuth();
  const user = useUser();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeline, setTimeline] =
    useState<ClientInferResponseBody<typeof contract.getWorkflowExecutionTimeline>>();

  const { status, result, input } = useTimelineParser(timeline);

  const fetchWorkflowExecution = useCallback(async () => {
    if (!params.clusterId || !user.isLoaded) {
      return;
    }

    try {
      const result = await client.getWorkflowExecutionTimeline({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: params.clusterId,
          workflowName: params.workflowName,
          executionId: params.executionId,
        },
      });

      if (result.status === 200) {
        setTimeline(result.body);
      } else {
        createErrorToast(result, "Failed to load workflow executions");
      }
    } catch (error) {
      createErrorToast(error, "Failed to load workflow executions");
    } finally {
      setIsLoading(false);
    }
  }, [params.clusterId, params.workflowName, params.executionId, user.isLoaded, getToken]);

  useEffect(() => {
    // Initial fetch
    fetchWorkflowExecution();

    // Set up polling every 10 seconds
    const pollingInterval = setInterval(() => {
      fetchWorkflowExecution();
    }, 10000); // 10 seconds

    // Cleanup interval on component unmount
    return () => {
      clearInterval(pollingInterval);
    };
  }, [fetchWorkflowExecution, timeline?.execution.job.status]);

  const submitApproval = useCallback(
    async ({ approved }: { approved: boolean }) => {
      const clusterId = params.clusterId;
      const jobId = timeline?.execution.job.id;

      if (!clusterId || !jobId) {
        return;
      }

      const result = await client.createJobApproval({
        body: {
          approved,
        },
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId,
          jobId,
        },
      });

      if (result.status !== 204) {
        createErrorToast(result, "Failed to approve call");
      } else {
        setTimeout(() => {
          fetchWorkflowExecution();
        }, 1000);
      }
    },
    [fetchWorkflowExecution, getToken, params.clusterId, timeline?.execution.job.id]
  );

  const nodes = [
    ...(timeline?.runs.map(runToNode) || []),
    ...(timeline?.events.map(eventToNode) || []),
    ...(result
      ? [
          {
            id: "result",
            title: "Execution Result",
            tooltip: "Final result of the workflow execution",
            icon: <Terminal className="w-3.5 h-3.5" />,
            iconBackground:
              status === "failure" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700",
            interactive: false,
            result,
          },
        ]
      : []),
  ].filter(Boolean) as Node[];

  // Sort nodes by date in ascending order (oldest first) - but keep result at the end
  const sortedNodes = nodes
    .filter(node => node.id !== "result")
    .sort((a, b) => a.time!.getTime() - b.time!.getTime());

  const resultNode = nodes.find(node => node.id === "result");
  if (resultNode) {
    sortedNodes.push(resultNode);
  }

  const handleNodeClick = (node: Node) => {
    setSelectedRunId(selectedRunId ? null : node.id);
  };

  if (isLoading || !timeline) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 flex gap-6">
      {/* Left column - Details */}
      <div className="w-1/4 flex flex-col gap-4">
        <div className="rounded-lg border bg-card">
          <div className="flex items-center gap-3 mb-4 border-b p-4">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Workflow className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-medium">Workflow Details</div>
              <div className="text-xs text-muted-foreground font-mono">
                {new Date(timeline.execution.createdAt).toISOString()} (
                {formatDistance(new Date(timeline.execution.createdAt), new Date(), {
                  addSuffix: true,
                })}
                )
              </div>
            </div>
          </div>

          <div className="space-y-4 text-sm p-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded bg-muted shrink-0">
                <Workflow className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-xs text-muted-foreground">Workflow</div>
                <div className="font-medium">
                  {timeline.execution.workflowName} (v{timeline.execution.workflowVersion})
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded bg-muted shrink-0">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-xs text-muted-foreground">Execution ID</div>
                <div>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {params.executionId}
                  </code>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "p-1.5 rounded shrink-0",
                  status === "failure"
                    ? "bg-rose-100"
                    : status === "success"
                      ? "bg-emerald-100"
                      : "bg-slate-100"
                )}
              >
                <div
                  className={cn(
                    "w-3.5 h-3.5 rounded-full",
                    status === "failure"
                      ? "bg-rose-500"
                      : status === "success"
                        ? "bg-emerald-500"
                        : "bg-slate-400"
                  )}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="font-medium capitalize">{status}</div>
              </div>
            </div>

            {!!input && (
              <div className="pt-2 mt-2 border-t border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Input Parameters</span>
                </div>
                <div className="bg-muted/50 rounded-md p-3">
                  <div className="font-mono text-xs">
                    {typeof input === "object" ? (
                      <ReadOnlyJSON json={input} />
                    ) : (
                      <span>{JSON.stringify(input)}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {timeline.execution.job.approvalRequested && timeline.execution.job.approved === null && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-600">
              <Pause className="w-4 h-4" />
              <h3 className="text-sm font-medium">Approval Required</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              The Workflow is currently paused awaiting approval.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="default"
                className="w-full"
                onClick={() => {
                  submitApproval({ approved: true });
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  submitApproval({ approved: false });
                }}
              >
                Deny
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right column - Timeline */}
      <div className="flex-1 overflow-hidden rounded-sm border bg-card">
        <div className="flex items-center gap-3 p-4 border-b">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium">Timeline</div>
            <div className="text-xs text-muted-foreground font-mono">
              {sortedNodes.length} events
            </div>
          </div>
        </div>
        <div className="overflow-y-auto">
          <div className="divide-y divide-border/40">
            {sortedNodes.map(node => (
              <WorkflowEvent
                key={node.id}
                node={node}
                onClick={node.interactive ? () => handleNodeClick(node) : undefined}
              />
            ))}
          </div>
        </div>
      </div>

      <Sheet open={!!selectedRunId} onOpenChange={() => setSelectedRunId(null)}>
        <SheetContent style={{ minWidth: "80%" }} className="overflow-y-auto h-screen">
          <SheetHeader>
            <SheetTitle>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="font-mono text-xl">Agent Run Details</div>
                  <div className="text-sm text-muted-foreground">
                    View the details and output of this run
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            {selectedRunId && (
              <Run clusterId={params.clusterId} runId={selectedRunId} interactiveOveride={false} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
