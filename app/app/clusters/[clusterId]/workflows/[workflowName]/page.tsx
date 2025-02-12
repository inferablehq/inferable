"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { ServerConnectionStatus } from "@/components/server-connection-pane";
import { useRouter } from "next/navigation";

export default function WorkflowDetailsPage({ 
  params 
}: { 
  params: { 
    clusterId: string, 
    workflowName: string 
  } 
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const user = useUser();
  const [executions, setExecutions] = useState<{ 
    id: string; 
    workflowName: string; 
    workflowVersion: number; 
    createdAt: Date; 
    updatedAt: Date; 
  }[]>([]);
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
        ServerConnectionStatus.addEvent({
          type: "listWorkflowExecutions",
          success: false,
        });
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
      <ScrollArea className="rounded-lg bg-white shadow-sm transition-all duration-200 overflow-y-auto h-[calc(100vh-15rem)] border-b border-border/50">
        <div className="p-4">
          <h1 className="text-2xl font-semibold mb-4">
            Workflow: {params.workflowName}
          </h1>
          <div className="space-y-3">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="rounded-lg bg-white shadow-sm transition-all duration-200 overflow-y-auto h-[calc(100vh-15rem)] border-b border-border/50">
      <div className="p-4">
        <h1 className="text-2xl font-semibold mb-4">
          Workflow: {params.workflowName}
        </h1>
        {executions.length === 0 ? (
          <p className="text-muted-foreground text-center">No workflow executions found</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow header>
                <TableHead>Execution ID</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Updated At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((execution, index) => (
                <TableRow 
                  key={index} 
                  onClick={() => handleExecutionClick(execution.id)}
                  className="cursor-pointer"
                >
                  <TableCell>{execution.id}</TableCell>
                  <TableCell>{execution.workflowVersion}</TableCell>
                  <TableCell>{execution.createdAt.toLocaleString()}</TableCell>
                  <TableCell>{execution.updatedAt.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </ScrollArea>
  );
}
