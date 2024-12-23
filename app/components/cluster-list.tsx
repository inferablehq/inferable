"use client";

import { useLocalStorage } from "@uidotdev/usehooks";
import { useMemo } from "react";
import { ClusterCard } from "./cluster-card";

interface Cluster {
  id: string;
  name: string;
  description: string | null;
}

interface ClusterListProps {
  clusters: Cluster[];
}

export function ClusterList({ clusters }: ClusterListProps) {
  const [recentClusters] = useLocalStorage<
    Array<{ id: string; name: string; orgId: string }>
  >("recentClusters", []);

  const sortedClusters = useMemo(() => {
    const recentClusterIds = recentClusters.map((rc) => rc.id);
    return clusters.sort((a, b) => {
      const aIsRecent = recentClusterIds.includes(a.id);
      const bIsRecent = recentClusterIds.includes(b.id);
      if (aIsRecent && !bIsRecent) return -1;
      if (!aIsRecent && bIsRecent) return 1;
      return 0;
    });
  }, [clusters, recentClusters]);

  return (
    <div className="flex flex-wrap">
      {sortedClusters.map((cluster) => (
        <ClusterCard key={cluster.id} cluster={cluster} />
      ))}
    </div>
  );
}
