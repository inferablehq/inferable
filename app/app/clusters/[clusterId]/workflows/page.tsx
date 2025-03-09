"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import {
  SmallDeadGrayCircle,
  SmallDeadGreenCircle,
  SmallDeadRedCircle,
  SmallLiveAmberCircle,
  SmallLiveBlueCircle,
} from "@/components/circles";
import { ClusterDetails } from "@/components/cluster-details";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { formatDistance } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { WorkflowTriggerModal } from "@/components/workflow-trigger-modal";
import { HackerNewsDemo } from "@/components/hacker-news-demo";
import { RefreshCw } from "lucide-react";

type ExecutionStatus =
  | "pending"
  | "running"
  | "success"
  | "failure"
  | "stalled"
  | "interrupted";

const statusToCircle: {
  [key in ExecutionStatus]: React.ReactNode;
} = {
  pending: <SmallLiveAmberCircle />,
  running: <SmallLiveBlueCircle />,
  stalled: <SmallDeadGrayCircle />,
  success: <SmallDeadGreenCircle />,
  failure: <SmallDeadRedCircle />,
  interrupted: <SmallDeadRedCircle />,
};

type RunStatus = "pending" | "running" | "paused" | "done" | "failed";

const runStatusToCircle: {
  [key in RunStatus]: React.ReactNode;
} = {
  pending: <SmallLiveAmberCircle />,
  running: <SmallLiveBlueCircle />,
  paused: <SmallLiveAmberCircle />,
  done: <SmallDeadGreenCircle />,
  failed: <SmallDeadRedCircle />,
};

type WorkflowExecution = ClientInferResponseBody<
  typeof contract.listWorkflowExecutions,
  200
>[0];

// Custom hook for interval functionality
function useInterval(callback: () => void, delay: number | null) {
  useEffect(() => {
    if (delay === null) return;

    const intervalId = setInterval(callback, delay);
    return () => clearInterval(intervalId);
  }, [callback, delay]);
}

export default function WorkflowsPage({
  params,
}: {
  params: { clusterId: string };
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const user = useUser();
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState<number>(0);
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "all">(
    "all",
  );
  const [appliedNameFilter, setAppliedNameFilter] = useState("");
  const [appliedStatusFilter, setAppliedStatusFilter] = useState<
    ExecutionStatus | "all"
  >("all");

  const fetchExecutions = useCallback(async () => {
    if (!params.clusterId || !user.isLoaded) {
      return;
    }

    setIsRefreshing(true);
    try {
      const result = await client.listWorkflowExecutions({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: params.clusterId,
        },
        query: {
          workflowName: appliedNameFilter || undefined,
          workflowExecutionStatus:
            appliedStatusFilter === "all" ? undefined : appliedStatusFilter,
        },
      });

      if (result.status === 200) {
        setExecutions(result.body);
        setLastRefreshed(new Date());
      } else {
        createErrorToast(result.body, "Failed to load workflow executions");
      }
    } catch (error) {
      createErrorToast(error, "Failed to load workflow executions");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [
    params.clusterId,
    getToken,
    user.isLoaded,
    appliedNameFilter,
    appliedStatusFilter,
  ]);

  // Initial fetch
  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  // Auto-refresh every 10 seconds
  useInterval(fetchExecutions, 10000);

  // Update seconds since last refresh
  useEffect(() => {
    if (!lastRefreshed) return;

    const intervalId = setInterval(() => {
      const seconds = Math.floor(
        (new Date().getTime() - lastRefreshed.getTime()) / 1000,
      );
      setSecondsSinceRefresh(seconds);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [lastRefreshed]);

  const handleApplyFilters = () => {
    setAppliedNameFilter(nameFilter);
    setAppliedStatusFilter(statusFilter);
  };

  const handleClearFilters = () => {
    setNameFilter("");
    setStatusFilter("all");
    setAppliedNameFilter("");
    setAppliedStatusFilter("all");
  };

  const handleRefresh = () => {
    fetchExecutions();
  };

  function ExecutionRow({ execution, job, runs }: WorkflowExecution) {
    const handleClick = () => {
      router.push(
        `/clusters/${params.clusterId}/workflows/${execution.workflowName}/executions/${execution.id}`,
      );
    };

    const runStatusCounts = runs.reduce(
      (acc, run) => {
        if (run.status) {
          acc[run.status] = (acc[run.status] || 0) + 1;
        }
        return acc;
      },
      {} as Record<RunStatus, number>,
    );

    const status = job.resultType === "rejection" ? "failure" : job.status;

    return (
      <tr
        onClick={handleClick}
        className={`group cursor-pointer ${
          job.approvalRequested && !job.approved
            ? "bg-amber-50 hover:bg-amber-100/80"
            : "hover:bg-gray-50/50"
        }`}
      >
        <td className="px-6 py-4 whitespace-nowrap">
          <span className="text-xs text-slate-500 font-mono">
            {execution.id.slice(0, 8)}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium">
              {execution.workflowName}
            </span>
            {job.approvalRequested && !job.approved && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                Needs Approval
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium">
              {execution.workflowVersion && `v${execution.workflowVersion}`}
            </span>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="inline-flex items-center space-x-1.5 px-2 py-1 rounded-md bg-muted/50">
            {status && statusToCircle[status as ExecutionStatus]}
            <span className="text-xs font-medium">{status}</span>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          {runs.length > 0 && (
            <div className="flex items-center space-x-2">
              {Object.entries(runStatusCounts).map(([status, count]) => (
                <div
                  key={status}
                  className="inline-flex items-center space-x-1.5 px-2 py-1 rounded-md bg-muted/50"
                >
                  {runStatusToCircle[status as RunStatus]}
                  <span className="text-xs font-medium">
                    {count} {status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
          <span>{new Date(execution.createdAt).toISOString()}</span>
        </td>
      </tr>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl mb-2">Workflows</h1>
        <div className="space-y-3">
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 p-6">
      <div className="w-96 shrink-0 space-y-4">
        <Card className="bg-white border border-gray-200 rounded-xl transition-all duration-200">
          <CardHeader>
            <CardTitle>Workflows</CardTitle>
            <CardDescription>
              Workflows provide a powerful &ldquo;Workflow as Code&rdquo;
              approach to orchestrating complex, multi-step AI agent
              interactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <h2 className="text-sm font-semibold">Filters</h2>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Workflow Name
                </label>
                <Input
                  placeholder="Filter by name..."
                  value={nameFilter}
                  onChange={e => setNameFilter(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Status
                </label>
                <Select
                  value={statusFilter}
                  onValueChange={value =>
                    setStatusFilter(value as ExecutionStatus | "all")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="stalled">Stalled</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failure">Failure</SelectItem>
                    <SelectItem value="interrupted">Interrupted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Button onClick={handleApplyFilters} className="w-full">
                  Apply Filters
                </Button>
                {(appliedNameFilter || appliedStatusFilter !== "all") && (
                  <Button
                    onClick={handleClearFilters}
                    variant="outline"
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4">
          <WorkflowTriggerModal
            clusterId={params.clusterId}
            onTrigger={fetchExecutions}
          />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {!isLoading && executions.length === 0 ? (
          <div className="text-center py-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No workflows found
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by creating your first workflow using our quick start
              guide.
            </p>
            <div className="flex flex-row gap-2 items-center justify-center">
              <Link
                href="https://docs.inferable.ai/pages/quick-start"
                target="_blank"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                View Quick Start Guide
              </Link>
              <HackerNewsDemo clusterId={params.clusterId} />
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-muted-foreground">
                {lastRefreshed && (
                  <>
                    Last updated: {lastRefreshed.toLocaleTimeString()}
                    <span className="ml-1 text-xs">
                      ({secondsSinceRefresh}s ago)
                    </span>
                  </>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`flex items-center gap-1 transition-all duration-200 ${isRefreshing ? "bg-muted" : ""}`}
              >
                <RefreshCw
                  className={`h-4 w-4 transition-all duration-200 ${isRefreshing ? "animate-spin text-primary" : ""}`}
                />
                <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
              </Button>
            </div>
            <div
              className={`border rounded-lg overflow-hidden transition-opacity duration-200 ${isRefreshing ? "opacity-70" : "opacity-100"}`}
            >
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      ID
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Workflow
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Version
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Execution Status
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Agent Runs
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Started
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {executions.map(execution => (
                    <ExecutionRow key={execution.execution.id} {...execution} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="w-50 shrink-0">
        <ClusterDetails clusterId={params.clusterId} />
      </div>
    </div>
  );
}
