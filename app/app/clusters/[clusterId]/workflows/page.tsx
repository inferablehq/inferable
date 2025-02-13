"use client";

import { client } from "@/client/client";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientInferResponseBody } from "@ts-rest/core";
import { contract } from "@/client/contract";

export default function WorkflowsPage({ params }: { params: { clusterId: string } }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const user = useUser();
  const [workflows, setWorkflows] = useState<ClientInferResponseBody<typeof contract.listWorkflows, 200>>([]);
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-6">
            {workflows
              .map((workflow) => {
                return (
                  <Card className="flex flex-col" key={workflow.name}>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <CardTitle>{workflow.name}</CardTitle>
                      </div>
                      {workflow.description && (<CardDescription>{workflow.description}</CardDescription>)}
                    </CardHeader>
                  <CardContent>
                    <Button className="w-full" variant="outline" onClick={() => handleWorkflowClick(workflow.name)}>
                      View Executions
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                  </Card>
                );
              })}
          </div>
        )}
    </div>
  );
}
