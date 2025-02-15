"use client";

import { client } from "@/client/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRelative } from "date-fns";
import { ClientInferResponseBody } from "@ts-rest/core";
import { contract } from "@/client/contract";

const buildStatusCell = (execution: ClientInferResponseBody<typeof contract.listWorkflowExecutions, 200>[number]) => {
  if (execution.job.approvalRequested && !execution.job.approved) {
    if (execution.job.approved === null) {
      return <span>Awaiting approval</span>;
    } else {
      return <span>Approval Rejected</span>;
    }
  }

  if (execution.job.resultType === "rejection") {
    return <span>Failure</span>;
  }

  return <span>{execution.job.status}</span>;
}

export default function WorkflowDetailsPage({
  params,
}: {
  params: {
    clusterId: string;
    workflowName: string;
  };
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const user = useUser();
  const [executions, setExecutions] = useState<ClientInferResponseBody<typeof contract.listWorkflowExecutions, 200>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWorkflowExecutions = useCallback(async () => {
    if (!params.clusterId || !user.isLoaded) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await client.listWorkflowExecutions({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: params.clusterId,
          workflowName: params.workflowName,
        },
      });

      if (result.status === 200) {
        setExecutions(result.body);
      } else {
        createErrorToast(result.body, "Failed to load workflow executions");
      }
    } catch (error) {
      createErrorToast(error, "Failed to load workflow executions");
    } finally {
      setIsLoading(false);
    }
  }, [params.clusterId, params.workflowName, getToken, user.isLoaded]);

  useEffect(() => {
    fetchWorkflowExecutions();
  }, [fetchWorkflowExecutions]);

  const handleExecutionClick = (executionId: string) => {
    router.push(`/clusters/${params.clusterId}/workflows/${params.workflowName}/${executionId}`);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl mb-2">{params.workflowName} Executions</h1>
        <div className="space-y-3">
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl mb-2">
        <pre>{params.workflowName}</pre>
      </h1>
      {executions.length === 0 ? (
        <p className="text-muted-foreground text-center">No workflow executions found</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow header>
              <TableHead>Execution ID</TableHead>
              <TableHead>Workflow Version</TableHead>
              <TableHead>Triggered At</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executions
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((execution, index) => (
                <TableRow
                  key={index}
                  onClick={() => handleExecutionClick(execution.id)}
                  className="cursor-pointer"
                >
                  <TableCell>{execution.id}</TableCell>
                  <TableCell>{execution.workflowVersion}</TableCell>
                  <TableCell>{formatRelative(execution.createdAt, new Date())}</TableCell>
                  <TableCell>{buildStatusCell(execution)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
