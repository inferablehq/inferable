"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { useAuth } from "@clerk/nextjs";
import {
  ExternalLink,
  Network,
  PlayCircle,
  Settings,
  NetworkIcon,
  BarChart2,
  WorkflowIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ErrorDisplay from "./error-display";
import { LiveCheck } from "./live-check";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { ClientInferResponseBody } from "@ts-rest/core";

interface ClusterBreadcrumbsProps {
  clusterId: string;
  clusterName?: string;
  isDemo?: boolean;
}

const linkStyles =
  "flex items-center px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-sm transition-all gap-2 border border-transparent hover:border-border";

const activeLinkStyles = "bg-accent text-foreground border-border";

function BreadcrumbLinks({
  clusterId,
  clusterName,
  isDemo,
}: ClusterBreadcrumbsProps) {
  const pathname = usePathname();

  const isCurrentPath = (path: string) => {
    // Special case for clusters page to avoid matching all paths
    if (path === "/clusters") {
      return pathname === "/clusters";
    }
    return pathname?.startsWith(path) ?? false;
  };

  const getLinkStyles = (path: string) => {
    return cn(linkStyles, isCurrentPath(path) && activeLinkStyles);
  };

  return (
    <div className="px-6 py-2 flex gap-2 items-center border-b bg-background">
      <div className="flex items-center gap-2 mr-2">
        <Link
          href={`/clusters/${clusterId}/workflows`}
          className="text-lg text-muted-foreground tracking-tight hover:text-foreground"
        >
          {clusterName || "..."}
        </Link>
        {isDemo && <Badge variant="secondary">Demo</Badge>}
      </div>
      <Link
        href={`/clusters/${clusterId}/workflows`}
        className={getLinkStyles(`/clusters/${clusterId}/workflows`)}
      >
        <WorkflowIcon className="h-4 w-4" /> Workflows
      </Link>
      <Link
        href={`/clusters/${clusterId}/integrations`}
        className={getLinkStyles(`/clusters/${clusterId}/integrations`)}
      >
        <NetworkIcon className="h-4 w-4" /> Integrations
      </Link>
      <Link
        href={`/clusters/${clusterId}/usage`}
        className={getLinkStyles(`/clusters/${clusterId}/usage`)}
      >
        <BarChart2 className="h-4 w-4" /> Usage
      </Link>
      <Link
        href={`/clusters/${clusterId}/settings`}
        className={getLinkStyles(`/clusters/${clusterId}/settings`)}
      >
        <Settings className="h-4 w-4" /> Settings
      </Link>
      <Link
        href={`https://docs.inferable.ai`}
        target="_blank"
        className={linkStyles}
      >
        <ExternalLink className="h-4 w-4" /> Docs
      </Link>
      <div className="ml-auto">
        <LiveCheck />
      </div>
    </div>
  );
}

export function ClusterBreadcrumbs({ clusterId }: ClusterBreadcrumbsProps) {
  const { getToken } = useAuth();
  const [clusterDetails, setClusterDetails] = useState<ClientInferResponseBody<
    typeof contract.getCluster,
    200
  > | null>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    const fetchClusterDetails = async () => {
      try {
        const response = await client.getCluster({
          headers: {
            authorization: `Bearer ${await getToken()}`,
          },
          params: { clusterId },
        });

        if (response.status === 200) {
          setClusterDetails(response.body);
        } else {
          setError(response);
        }
      } catch (err) {
        setError(err);
      }
    };

    fetchClusterDetails();
  }, [clusterId, getToken]);

  if (error) {
    return (
      <div className="px-6 py-2 flex gap-2 items-center border-b bg-background">
        <ErrorDisplay error={error.body} status={error.status} />
      </div>
    );
  }

  return (
    <BreadcrumbLinks
      clusterId={clusterId}
      clusterName={clusterDetails?.name}
      isDemo={clusterDetails?.isDemo}
    />
  );
}

export function GlobalBreadcrumbs() {
  const pathname = usePathname();

  const isCurrentPath = (path: string) => {
    // Special case for clusters page to avoid matching all paths
    if (path === "/clusters") {
      return pathname === "/clusters";
    }
    return pathname?.startsWith(path) ?? false;
  };

  const getLinkStyles = (path: string) => {
    return cn(linkStyles, isCurrentPath(path) && activeLinkStyles);
  };

  return (
    <div className="px-6 py-2 flex gap-2 border-b bg-background">
      <Link href={`/clusters`} className={getLinkStyles("/clusters")}>
        <Network className="h-4 w-4" /> Clusters
      </Link>
      <Link
        href={`https://docs.inferable.ai`}
        target="_blank"
        className={linkStyles}
      >
        <ExternalLink className="h-4 w-4" /> Docs
      </Link>
      <div className="ml-auto">
        <LiveCheck />
      </div>
    </div>
  );
}
