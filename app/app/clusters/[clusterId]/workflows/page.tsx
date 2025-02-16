"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import {
  SmallDeadGreenCircle,
  SmallDeadRedCircle,
  SmallLiveAmberCircle,
  SmallLiveBlueCircle,
  SmallLiveGreenCircle,
} from "@/components/circles";
import { ClusterDetails } from "@/components/cluster-details";
import { Skeleton } from "@/components/ui/skeleton";
import { Run } from "@/lib/types";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { formatDistance } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RunStatus = 'pending' | 'running' | 'paused' | 'done' | 'failed';

const statusToCircle: {
  [key in RunStatus]: React.ReactNode;
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

function RunPill({
  workflow,
  userId,
  group,
  router,
  params,
}: {
  workflow: Run;
  userId: string | null;
  group: WorkflowGroup;
  router: ReturnType<typeof useRouter>;
  params: { clusterId: string };
}) {
  const latestRun = group.workflows[0];
  const statusCounts = group.workflows.reduce((acc, w) => {
    const status = w.status as RunStatus;
    if (status) {
      acc[status] = (acc[status] || 0) + 1;
    }
    return acc;
  }, {} as Record<RunStatus, number>);

  const handleClick = () => {
    router.push(`/clusters/${params.clusterId}/workflows/${group.workflowName}/executions/${group.executionId}`);
  };

  return (
    <tr
      onClick={handleClick}
      className="group hover:bg-gray-50/50 cursor-pointer"
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-xs text-slate-500 font-mono">
          {group.executionId?.slice(0, 8)}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium">
            {group.workflowName}
            {group.workflowVersion && ` v${group.workflowVersion}`}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center space-x-3 text-sm">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-muted/50">
              {statusToCircle[status as RunStatus]}
              <span className="text-xs font-medium">
                {count} {status}
              </span>
            </div>
          ))}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
        <span>
          {new Date(latestRun.createdAt).toISOString()} ({formatDistance(new Date(latestRun.createdAt), new Date(), { addSuffix: true })})
          {latestRun.userId === userId && " by you"}
        </span>
      </td>
    </tr>
  );
}

export default function WorkflowsPage({ params }: { params: { clusterId: string } }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const user = useUser();

  const [runs, setRuns] = useState<ClientInferResponseBody<typeof contract.listRuns, 200>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<RunStatus | "all">("all");

  const fetchRuns = useCallback(async () => {
    if (!params.clusterId || !user.isLoaded) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await client.listRuns({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: params.clusterId,
        },
        query: {
          type: "workflow",
        },
      });

      if (result.status === 200) {
        setRuns(result.body);
      } else {
        createErrorToast(result.body, "Failed to load workflows");
      }
    } catch (error) {
      createErrorToast(error, "Failed to load workflows");
    } finally {
      setIsLoading(false);
    }
  }, [params.clusterId, getToken, user.isLoaded]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

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

  const workflowGroups = groupWorkflowsByExecution(runs)
    .filter(group => group.executionId !== null); // Filter out standalone runs

  const filteredWorkflowGroups = groupWorkflowsByExecution(runs)
    .filter(group => group.executionId !== null) // Filter out standalone runs
    .filter(group => {
      // Apply name filter
      if (nameFilter && !group.workflowName?.toLowerCase().includes(nameFilter.toLowerCase())) {
        return false;
      }

      // Apply status filter
      if (statusFilter !== "all") {
        const hasMatchingStatus = group.workflows.some(w => w.status === statusFilter);
        if (!hasMatchingStatus) {
          return false;
        }
      }

      return true;
    });

  return (
    <div className="flex gap-6 p-6">
      <div className="w-96 shrink-0 space-y-4">
        <Card className="bg-white border border-gray-200 rounded-xl transition-all duration-200">
          <CardContent className="pt-6">
            <div className="mb-8">
              <h1 className="text-2xl font-semibold mb-2">Workflows</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Workflows provide a powerful &ldquo;Workflow as Code&rdquo; approach to orchestrating complex, multi-step AI agent interactions.
                <span className="block mt-2">
                  Learn more in our{" "}
                  <Link href="https://docs.inferable.ai/pages/workflows" target="_blank" className="text-primary hover:underline">
                    Workflows documentation
                  </Link>
                  {" "}or get started with our{" "}
                  <Link href="https://docs.inferable.ai/pages/quick-start" target="_blank" className="text-primary hover:underline">
                    Quick Start guide
                  </Link>.
                </span>
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-semibold">Filters</h2>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Workflow Name
                </label>
                <Input
                  placeholder="Filter by name..."
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Status
                </label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RunStatus | "all")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(nameFilter || statusFilter !== "all") && (
                <Button
                  onClick={() => {
                    setNameFilter("");
                    setStatusFilter("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 min-w-0">
        {!isLoading && workflowGroups.length === 0 ? (
          <div className="text-center py-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No workflows found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by creating your first workflow using our quick start guide.
            </p>
            <Link
              href="https://docs.inferable.ai/pages/quick-start"
              target="_blank"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              View Quick Start Guide
            </Link>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Execution ID
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Workflow Name
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agent Status
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Started
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredWorkflowGroups.map((group) => (
                  <RunPill
                    key={group.executionId}
                    workflow={group.workflows[0]}
                    group={group}
                    userId={user.user?.id ?? null}
                    router={router}
                    params={params}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="w-50 shrink-0">
        <ClusterDetails clusterId={params.clusterId} />
      </div>
    </div>
  );
}
