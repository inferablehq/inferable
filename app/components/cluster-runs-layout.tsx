"use client";

import { ClusterDetails } from "@/components/cluster-details";
import { RunList } from "@/components/run-list";
import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return mounted ? matches : false;
}

interface ClusterRunsLayoutProps {
  clusterId: string;
  children: React.ReactNode;
}

export function ClusterRunsLayout({ clusterId, children }: ClusterRunsLayoutProps) {
  return (
    <div className="flex flex-row gap-6 p-6 w-full">
      <div className="flex-shrink-0 transition-all duration-300">
        <RunList clusterId={clusterId} />
      </div>
      <div className="relative transition-all duration-300 flex-grow">{children}</div>
      <div className="flex-shrink-0 transition-all duration-300">
        <ClusterDetails clusterId={clusterId} />
      </div>
    </div>
  );
}
