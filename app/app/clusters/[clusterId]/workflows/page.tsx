"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ServerConnectionStatus } from "@/components/server-connection-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";

export default function WorkflowsPage({ params }: { params: { clusterId: string } }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const user = useUser();
  const [workflows, setWorkflows] = useState<{ name: string; version: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWorkflows = useCallback(async () => {
    if (!params.clusterId || !user.isLoaded) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await client.listWorkflows({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId: params.clusterId,
        },
      });

      if (result.status === 200) {
        setWorkflows(result.body);
      } else {
        ServerConnectionStatus.addEvent({
          type: "listWorkflows",
          success: false,
        });
      }
    } catch (error) {
      createErrorToast(error, "Failed to load workflows");
    } finally {
      setIsLoading(false);
    }
  }, [params.clusterId, getToken, user.isLoaded]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleWorkflowClick = (workflowName: string) => {
    router.push(`/clusters/${params.clusterId}/workflows/${workflowName}`);
  };

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
    <div className="p-6">
      <h1 className="text-2xl mb-2">Workflows</h1>
      {workflows.length === 0 ? (
        <p className="text-muted-foreground text-center">No workflows found</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow header>
              <TableHead>Name</TableHead>
              <TableHead>Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workflows.map((workflow, index) => (
              <TableRow
                key={index}
                onClick={() => handleWorkflowClick(workflow.name)}
                className="cursor-pointer"
              >
                <TableCell>{workflow.name}</TableCell>
                <TableCell>{workflow.version}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
