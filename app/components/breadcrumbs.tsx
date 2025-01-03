import { client } from "@/client/client";
import { auth } from "@clerk/nextjs";
import {
  BookOpen,
  ExternalLink,
  Network,
  PlayCircle,
  Settings,
  Hammer,
  NetworkIcon,
  BarChart2,
} from "lucide-react";
import Link from "next/link";
import ErrorDisplay from "./error-display";
import { LiveCheck } from "./live-check";

interface ClusterBreadcrumbsProps {
  clusterId: string;
}

const linkStyles =
  "flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-slate-50 rounded-sm transition-all gap-2 border border-transparent hover:border-gray-100";

export async function ClusterBreadcrumbs({
  clusterId,
}: ClusterBreadcrumbsProps) {
  const { getToken } = auth();

  const clusterDetails = await client.getCluster({
    headers: { authorization: `Bearer ${await getToken()}` },
    params: { clusterId },
  }).catch(() => {
    return { status: 500, body: { error: "Failed to fetch cluster details" } } as const;
  });

  if (clusterDetails.status !== 200) {
    return (
      <ErrorDisplay
        error={clusterDetails.body}
        status={clusterDetails.status}
      />
    );
  }

  return (
    <div className="px-6 py-2 flex gap-2 items-center border-b bg-white">
      <div className="flex items-center gap-2">
        <h1 className="text-lg text-gray-400 mr-2 tracking-tight">
          {clusterDetails.body.name}
        </h1>
      </div>
      <Link href={`/clusters/${clusterId}/runs`} className={linkStyles}>
        <PlayCircle className="h-4 w-4" /> Runs
      </Link>
      {clusterDetails.body.enableRunConfigs && (
        <Link href={`/clusters/${clusterId}/configs`} className={linkStyles}>
          <Hammer className="h-4 w-4" /> Run Configs
        </Link>
      )}
      {clusterDetails.body.enableKnowledgebase && (
        <Link href={`/clusters/${clusterId}/knowledge`} className={linkStyles}>
          <BookOpen className="h-4 w-4" /> Knowledge
        </Link>
      )}
      <Link href={`/clusters/${clusterId}/integrations`} className={linkStyles}>
        <NetworkIcon className="h-4 w-4" /> Integrations
      </Link>
      <Link href={`/clusters/${clusterId}/usage`} className={linkStyles}>
        <BarChart2 className="h-4 w-4" /> Usage
      </Link>
      <Link href={`/clusters/${clusterId}/settings`} className={linkStyles}>
        <Settings className="h-4 w-4" /> Settings
      </Link>
      <div className="ml-auto">
        <LiveCheck />
      </div>
    </div>
  );
}

export async function GlobalBreadcrumbs() {
  return (
    <div className="px-6 py-2 flex gap-2 border-b bg-white">
      <Link href={`/clusters`} className={linkStyles}>
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
