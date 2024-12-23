"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createErrorToast } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { PlayIcon, PlusIcon, UserIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Badge } from "./ui/badge";
import { RunTab } from "./workflow-tab";
import { ServerConnectionStatus } from "./server-connection-pane";
import Link from "next/link";

type WorkflowListProps = {
  clusterId: string;
};

const runFiltersSchema = z.object({
  configId: z.string().optional(),
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

  const [runFilters, setRunFilters] = useState<
    z.infer<typeof runFiltersSchema>
  >({});
  const path = usePathname();

  useEffect(() => {
    if (!runFiltersQuery) {
      return;
    }

    const parsedFilters = runFiltersSchema.safeParse(
      JSON.parse(runFiltersQuery)
    );
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
        userId: (runToggle === "mine" ? userId : undefined) ?? undefined,
        limit: Math.min(limit, 500), // Ensure limit doesn't exceed 500
        configId: runFilters.configId,
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
  }, [
    clusterId,
    getToken,
    runToggle,
    userId,
    user.isLoaded,
    limit,
    runFilters,
  ]);

  useEffect(() => {
    if (runFilters?.configId) {
      fetchWorkflows();
    }
  }, [runFilters?.configId, fetchWorkflows]);

  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkflows, runFilters?.configId]);

  const loadMore = () => {
    if (limit < 50) {
      setLimit((prevLimit) => Math.min(prevLimit + 10, 50));
    } else {
      setHasMore(false);
    }
  };

  return (
      <ScrollArea className="rounded-md bg-white shadow-sm hover:shadow-lg transition-all duration-200 overflow-y-auto h-[300px] lg:h-[calc(100vh-16rem)] p-2 border border-border/50">
        {(!!runFilters.configId || !!runFilters.test) && (
          <div className="flex flex-row space-x-2 mb-4 pb-3 border-b border-border/50 items-center justify-between">
            {runFilters.configId && (
              <Badge
                className="px-2.5 py-1 cursor-pointer flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20"
                onClick={() => {
                  setRunFilters({});
                  if (path) {
                    router.push(path);
                  }
                }}
              >
                Filtering by Prompt
                <XIcon className="h-4 w-4" />
              </Badge>
            )}
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
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-secondary/50 p-0.5 rounded-md">
            <button
              onClick={() => setRunToggle("all")}
              className={`px-2.5 py-0.5 rounded text-xs flex items-center gap-1.5 transition-colors
                ${runToggle === "all"
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                }`}
            >
              <PlayIcon className="h-3 w-3" />
              <span className="text-xs hidden lg:block">All Runs</span>
            </button>
            <button
              onClick={() => setRunToggle("mine")}
              className={`px-2.5 py-0.5 rounded text-xs flex items-center gap-1.5 transition-colors
                ${runToggle === "mine"
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                }`}
            >
              <UserIcon className="h-3 w-3" />
              <span className="text-xs hidden lg:block">My Runs</span>
            </button>
          </div>
          <button
            onClick={() => router.push(`/clusters/${clusterId}/runs`)}
            className="px-2 py-0.5 rounded text-xs flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <PlusIcon className="h-3 w-3" />
            <span className="text-xs hidden lg:block">New</span>
          </button>
        </div>
        <div className="rounded-none">
          <RunTab
            workflows={workflows}
            onGoToWorkflow={goToWorkflow}
            onRefetchWorkflows={fetchWorkflows}
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
              Maximum number of runs loaded. Delete some runs to load older
              ones.
            </p>
          )}
        </div>
      </ScrollArea>
  );
}
