"use client";

import { ClusterDetails } from "@/components/cluster-details";
import { RunList } from "@/components/WorkflowList";
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
  const isSmallScreen = useMediaQuery("(max-width: 1024px)");
  const [isMinimized, setIsMinimized] = useState(() => {
    if (typeof window === "undefined") return false;
    const key = `cluster-runs-layout-minimized-${isSmallScreen ? "small" : "large"}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : false;
  });

  // Save to localStorage whenever isMinimized changes
  useEffect(() => {
    const key = `cluster-runs-layout-minimized-${isSmallScreen ? "small" : "large"}`;
    localStorage.setItem(key, JSON.stringify(isMinimized));
  }, [isMinimized, isSmallScreen]);

  // On small screens, show maximized by default unless explicitly minimized
  const isMaximized = isSmallScreen ? !isMinimized : isMinimized;

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6">
      {!isMaximized && (
        <div className="w-full lg:w-[300px] flex-shrink-0 transition-all duration-300">
          <RunList clusterId={clusterId} />
        </div>
      )}
      <div
        className={`w-full ${!isMaximized ? "max-w-[1024px]" : ""} relative transition-all duration-300`}
      >
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-white hover:bg-gray-50 shadow-sm ring-1 ring-gray-200 transition-all z-10"
          aria-label={isMaximized ? "Show sidebars" : "Hide sidebars"}
        >
          {isMaximized ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
        {children}
      </div>
      {!isMaximized && (
        <div className="w-full lg:w-[200px] flex-shrink-0 transition-all duration-300">
          <ClusterDetails clusterId={clusterId} />
        </div>
      )}
    </div>
  );
}
