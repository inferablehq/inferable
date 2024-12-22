"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { formatRelative } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { DeadGrayCircle, DeadRedCircle, LiveGreenCircle } from "./circles";
import ErrorDisplay from "./error-display";
import { EventsOverlayButton } from "./events-overlay";
import { cn } from "@/lib/utils";

function MachineCard({
  machine,
  clusterId,
}: {
  machine: ClientInferResponseBody<typeof contract.listMachines, 200>[number];
  clusterId: string;
}) {
  const isLive =
    Date.now() - new Date(machine.lastPingAt!).getTime() < 1000 * 60;

  return (
    <div
      className={cn(
        "rounded-xl p-5 shadow-sm border transition-all duration-200 hover:shadow-md",
        isLive
          ? "bg-green-50/30 border-green-100"
          : "bg-gray-50/30 border-gray-100"
      )}
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div>{isLive ? <LiveGreenCircle /> : <DeadGrayCircle />}</div>
          <div>
            <div className="text-sm font-medium font-mono">{machine.id}</div>
            <div className="text-xs text-muted-foreground">{machine.ip}</div>
          </div>
        </div>
        <EventsOverlayButton
          clusterId={clusterId}
          query={{ machineId: machine.id }}
        />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <div
          className={cn(
            "px-2 py-1 rounded-full font-medium",
            isLive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
          )}
        >
          {isLive ? "Active" : "Inactive"}
        </div>
        <div className="text-muted-foreground">
          Last heartbeat: {formatRelative(machine.lastPingAt!, new Date())}
        </div>
      </div>
    </div>
  );
}

export function MachineList({ clusterId }: { clusterId: string }) {
  const [machines, setMachines] = useState<
    ClientInferResponseBody<typeof contract.listMachines, 200>
  >([]);
  const [liveMachineCount, setLiveMachineCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { getToken } = useAuth();
  const [error, setError] = useState<any>(null);

  const getClusterMachines = useCallback(async () => {
    setIsLoading(true);
    try {
      const machinesResponse = await client.listMachines({
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
        params: {
          clusterId,
        },
      });

      if (machinesResponse.status === 200) {
        setMachines(machinesResponse.body);
        setLiveMachineCount(
          machinesResponse.body.filter(
            (m) => Date.now() - new Date(m.lastPingAt!).getTime() < 1000 * 60
          ).length
        );
      } else {
        setError(machinesResponse);
      }
    } finally {
      setIsLoading(false);
    }
  }, [clusterId, getToken]);

  useEffect(() => {
    getClusterMachines();
    const interval = setInterval(getClusterMachines, 1000 * 10);
    return () => clearInterval(interval);
  }, [getClusterMachines]);

  if (error) {
    return <ErrorDisplay status={error.status} error={error} />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Machines</h2>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            You have {liveMachineCount} machine
            {liveMachineCount === 1 ? "" : "s"} connected
          </p>
          {liveMachineCount > 0 && (
            <div className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              {liveMachineCount} Active
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {machines && machines.length > 0 ? (
          machines
            .sort(
              (a, b) =>
                new Date(b.lastPingAt!).getTime() -
                new Date(a.lastPingAt!).getTime()
            )
            .map((m) => (
              <MachineCard key={m.id} machine={m} clusterId={clusterId} />
            ))
        ) : (
          <div className="col-span-full flex items-center justify-center p-8 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex flex-col items-center gap-3">
              <DeadRedCircle />
              <span className="text-sm text-gray-600">
                Your machines are offline
              </span>
              <p className="text-xs text-muted-foreground max-w-[300px] text-center">
                No active machines found in this cluster. Make sure your
                machines are running and properly configured.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
