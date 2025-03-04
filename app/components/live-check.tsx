"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";

export function LiveCheck() {
  const [latency, setLatency] = useState<number | null>(null);
  const [isError, setIsError] = useState(false);

  const checkLive = useCallback(async () => {
    try {
      const start = performance.now();
      const response = await fetch("/api/live");
      const end = performance.now();

      if (response.ok) {
        setLatency(Math.round(end - start));
        setIsError(false);
      } else {
        setLatency(null);
        setIsError(true);
      }
    } catch (error) {
      setLatency(null);
      setIsError(true);
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkLive();

    // Poll every 5 seconds
    const interval = setInterval(checkLive, 5000);

    return () => clearInterval(interval);
  }, [checkLive]);

  const getActivityColor = () => {
    if (latency === null) return "text-gray-400";
    return isError ? "text-red-500" : "text-green-500";
  };

  return (
    <div
      title="API connection status"
      className="mt-0.5 inline-flex h-7 items-center justify-center text-xs rounded-sm transition-all gap-2 border border-transparent px-2"
    >
      <Activity className={`h-5 w-5 ${getActivityColor()} animate-pulse`} />
      <div className="flex flex-col items-start leading-none gap-1">
        <div className="text-[10px] text-gray-400">api.inferable.ai</div>
        <div className="flex items-center gap-1.5">
          <div className="tabular-nums text-gray-600">
            {latency === null ? "..." : isError ? "offline" : `${latency}ms`}
          </div>
        </div>
      </div>
    </div>
  );
}
