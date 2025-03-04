"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RunTab } from "./run-tab";

type WorkflowListProps = {
  clusterId: string;
};

export function RunList({ clusterId }: WorkflowListProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const user = useUser();
  const [limit, setLimit] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [runs, setRuns] = useState<
    ClientInferResponseBody<typeof contract.listRuns, 200>
  >([]);

  const goToCluster = useCallback(
    (c: string) => {
      router.push(`/clusters/${c}/runs`);
    },
    [router],
  );

  const goToRun = useCallback(
    (c: string, w: string) => {
      router.push(`/clusters/${c}/runs/${w}`);
    },
    [router],
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
        type: "conversation",
      },
      params: {
        clusterId: clusterId,
      },
    });

    if (result.status === 200) {
      setRuns(result.body);
      setHasMore(result.body.length === limit && limit < 50);
    } else {
      createErrorToast(result.body, "Failed to load runs");
    }
  }, [clusterId, getToken, user.isLoaded, limit]);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  const loadMore = () => {
    if (limit < 50) {
      setLimit((prevLimit) => Math.min(prevLimit + 10, 50));
    } else {
      setHasMore(false);
    }
  };

  return (
    <ScrollArea className="bg-white transition-all duration-200 overflow-y-auto h-[calc(100vh-12rem)] border-b border-border/50 min-w-[500px]">
      <div className="rounder-none">
        <RunTab
          runs={runs}
          onGoToRun={goToRun}
          onRefetchRuns={fetchRuns}
          onGoToCluster={goToCluster}
          clusterId={clusterId}
        />
        {hasMore && (
          <Button
            onClick={loadMore}
            className="w-full mt-4"
            variant="outline"
            size="sm"
          >
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
  );
}
