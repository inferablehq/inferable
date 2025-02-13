"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { PlayIcon, PlusIcon, UserIcon, XIcon, ExternalLinkIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Badge } from "./ui/badge";
import { RunTab } from "./run-tab";
import { ServerConnectionStatus } from "./server-connection-pane";

type WorkflowListProps = {
  clusterId: string;
};

const runFiltersSchema = z.object({
  test: z.boolean().optional(),
});

export function RunList({ clusterId }: WorkflowListProps) {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const user = useUser();
  const [runToggle, setRunToggle] = useState("all");
  const [limit, setLimit] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [workflows, setWorkflows] = useState<
    ClientInferResponseBody<typeof contract.listRuns, 200>
  >([]);
  const goToCluster = useCallback(
    (c: string) => {
      router.push(`/clusters/${c}/runs`);
    },
    [router]
  );

  const goToWorkflow = useCallback(
    (c: string, w: string) => {
      router.push(`/clusters/${c}/runs/${w}`);
    },
    [router]
  );

  const searchParams = useSearchParams();
  const runFiltersQuery = searchParams?.get("filters");

  const [runFilters, setRunFilters] = useState<z.infer<typeof runFiltersSchema>>({});
  const path = usePathname();

  useEffect(() => {
    if (!runFiltersQuery) {
      return;
    }

    const parsedFilters = runFiltersSchema.safeParse(JSON.parse(runFiltersQuery));
    if (parsedFilters.success) {
      setRunFilters(parsedFilters.data);
    } else {
      createErrorToast(parsedFilters.error, "Invalid filters specified");
    }
  }, [runFiltersQuery]);

  const fetchWorkflows = useCallback(async () => {
    if (!clusterId || !user.isLoaded) {
      return;
    }

    const result = await client.listRuns({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      query: {
        test: runFilters.test ? "true" : undefined,
        userId: (runToggle === "mine" ? `clerk:${userId}` : undefined) ?? undefined,
        limit: Math.min(limit, 500), // Ensure limit doesn't exceed 500
      },
      params: {
        clusterId: clusterId,
      },
    });

    if (result.status === 200) {
      setWorkflows(result.body);
      setHasMore(result.body.length === limit && limit < 50);
    } else {
      ServerConnectionStatus.addEvent({
        type: "listRuns",
        success: false,
      });
    }
  }, [clusterId, getToken, runToggle, userId, user.isLoaded, limit, runFilters]);

  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkflows]);

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
      <ScrollArea className="rounded-lg bg-white shadow-sm transition-all duration-200 overflow-y-auto h-[calc(100vh-15rem)] border-b border-border/50">
        {!!runFilters.test && (
          <div className="flex flex-row space-x-2 mb-4 pb-3 border-b border-border/50 items-center justify-between">
            {runFilters.test && (
              <Badge
                className="px-2.5 py-1 cursor-pointer flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20"
                onClick={() => {
                  setRunFilters({});
                  if (path) {
                    router.push(path);
                  }
                }}
              >
                Filtering By Test Runs
                <XIcon className="h-4 w-4" />
              </Badge>
            )}
          </div>
        )}
        <div className="rounder-none">
          <RunTab
            workflows={workflows}
            onGoToWorkflow={goToWorkflow}
            onRefetchWorkflows={fetchWorkflows}
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
