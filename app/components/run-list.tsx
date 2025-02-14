"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useAuth, useUser } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RunTab } from "./run-tab";
import { ServerConnectionStatus } from "./server-connection-pane";
import { ExternalLinkIcon } from "lucide-react";

type WorkflowListProps = {
  clusterId: string;
};

export function RunList({ clusterId }: WorkflowListProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const user = useUser();
  const [limit, setLimit] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [showWorkflowRuns, setShowWorkflowRuns] = useState(false);
  const [runs, setRuns] = useState<
    ClientInferResponseBody<typeof contract.listRuns, 200>
  >([]);

  const goToCluster = useCallback(
    (c: string) => {
      router.push(`/clusters/${c}/runs`);
    },
    [router]
  );

  const goToRun = useCallback(
    (c: string, w: string) => {
      router.push(`/clusters/${c}/runs/${w}`);
    },
    [router]
  );

  const fetchRuns = useCallback(async () => {
    if (!clusterId || !user.isLoaded) {
      return;
    }

    const result = await client.listRuns({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      query: {
        limit: Math.min(limit, 500), // Ensure limit doesn't exceed 500
      },
      params: {
        clusterId: clusterId,
      },
    });

    if (result.status === 200) {
      const filteredRuns = !showWorkflowRuns ? result.body.filter(run => run.workflowName == null) : result.body;

      setRuns(filteredRuns);
      setHasMore(filteredRuns.length === limit && limit < 50);
    } else {
      ServerConnectionStatus.addEvent({
        type: "listRuns",
        success: false,
      });
    }
  }, [clusterId, getToken, user.isLoaded, limit, showWorkflowRuns]);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  const loadMore = () => {
    if (limit < 50) {
      setLimit(prevLimit => Math.min(prevLimit + 10, 50));
    } else {
      setHasMore(false);
    }
  };

  return (
    <>
      <div className="flex gap-2 mb-4">
        <Button
          onClick={() => router.push(`/clusters/${clusterId}/runs`)}
          className="w-full"
          variant="outline"
          size="sm"
        >
          Start a Conversation
        </Button>
        <Button
          onClick={() => window.open("https://docs.inferable.ai/pages/workflows", "_blank")}
          className="w-full"
          variant="outline"
          size="sm"
        >
          Run a Workflow
          <ExternalLinkIcon className="ml-2 h-4 w-4" />
        </Button>
      </div>
      <div className="items-right flex gap-2 justify-end mb-4">
        <span className="text-sm">Include Workflow Runs</span>
        <Switch
          checked={showWorkflowRuns}
          onCheckedChange={setShowWorkflowRuns}
        />
      </div>
      <ScrollArea className="rounded-lg bg-white shadow-sm transition-all duration-200 overflow-y-auto h-[calc(100vh-15rem)] border-b border-border/50">
        <div className="rounder-none">
          <RunTab
            workflows={runs}
            onGoToWorkflow={goToRun}
            onRefetchWorkflows={fetchRuns}
            onGoToCluster={goToCluster}
            clusterId={clusterId}
          />
          {hasMore && (
            <Button onClick={loadMore} className="w-full mt-4" variant="outline" size="sm">
              Load More
            </Button>
          )}
          {!hasMore && limit >= 50 && (
            <p className="text-sm text-muted-foreground mt-4 text-center mb-2">
              Maximum number of runs loaded. Delete some runs to load older ones.
            </p>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
