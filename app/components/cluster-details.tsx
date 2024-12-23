"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Blocks, Cpu, Network } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SmallLiveGreenCircle } from "./circles";
import { Button } from "./ui/button";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody, ClientInferResponses } from "@ts-rest/core";
import { formatDistance, formatRelative } from "date-fns";
import { AppWindowIcon } from "lucide-react";
import ToolContextButton from "./chat/ToolContextButton";
import { DeadGrayCircle, DeadRedCircle, LiveGreenCircle } from "./circles";
import ErrorDisplay from "./error-display";
import { EventsOverlayButton } from "./events-overlay";
import { ServerConnectionStatus } from "./server-connection-pane";

function toServiceName(name: string) {
  return <span>{name}</span>;
}

function toFunctionName(name: string, serviceName: string) {
  if (serviceName === "InferableApplications") {
    return <span>Inferable App</span>;
  }

  return <span>{name}</span>;
}

function ControlPlaneBox() {
  return (
    <div className="rounded-xl bg-black p-5 shadow-md border border-border/50 text-sm w-[300px] mb-8 relative hover:shadow-lg transition-all duration-200">
      <div className="absolute left-[31px] bottom-[-34px] w-[2px] h-[28px] bg-border" />
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
          <Network className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <div className="text-lg font-medium text-white flex items-center gap-2">
            <span className="font-mono">Control Plane</span>
            <SmallLiveGreenCircle />
          </div>
          <div className="text-sm text-gray-400 font-mono flex items-center gap-2">
            <span>api.inferable.ai</span>
            <span className="px-1.5 py-0.5 rounded-full bg-green-900/30 text-green-300 text-xs">
              Connected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  clusterId,
  index,
  total,
}: {
  service: ClientInferResponseBody<typeof contract.listServices, 200>[number];
  clusterId: string;
  index: number;
  total: number;
}) {
  const isActive =
    new Date(service.timestamp) > new Date() ||
    Date.now() - new Date(service.timestamp).getTime() < 1000 * 60;

  return (
    <div className="relative">
      <div className="absolute left-8 top-[1.5rem] w-8 h-[2px] bg-border" />

      <div
        className={cn(
          "rounded-xl p-5 shadow-sm border transition-all duration-200 hover:shadow-md ml-16",
          isActive
            ? "bg-green-50/30 border-green-100"
            : "bg-gray-50/30 border-gray-100"
        )}
      >
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              {service.name === "InferableApplications" ? (
                <AppWindowIcon className="w-5 h-5 text-primary" />
              ) : (
                <Blocks className="w-5 h-5 text-primary" />
              )}
            </div>
            <div>
              <div className="text-base font-medium">
                {toServiceName(service.name)}
              </div>
              <div className="text-sm text-muted-foreground font-mono flex items-center gap-2">
                <span>
                  {service.functions?.length || 0} Function
                  {service.functions?.length !== 1 ? "s" : ""}
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium",
                    isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  )}
                >
                  {isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-2/3">Function</TableHead>
                <TableHead className="w-1/3">Last Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {service.functions
                ?.sort((a, b) => a.name.localeCompare(b.name))
                .map((func) => (
                  <TableRow key={func.name} className="hover:bg-secondary/40">
                    <TableCell className="w-2/3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {toFunctionName(func.name, service.name)}
                          </span>
                          <ToolContextButton
                            clusterId={clusterId}
                            service={service.name}
                            functionName={func.name}
                          />
                        </div>
                        <div
                          className="truncate text-xs text-muted-foreground max-w-[40vw] font-mono"
                          title={func.description || "No description"}
                        >
                          {func.description || "No description"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="w-1/3">
                      {new Date(service.timestamp) > new Date() ? (
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          <span>Permanent Sync</span>
                        </div>
                      ) : (
                        <span className="font-mono text-sm">
                          {formatDistance(
                            new Date(service.timestamp),
                            new Date(),
                            { addSuffix: true }
                          )}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export default function ServicesOverview({ clusterId }: { clusterId: string }) {
  const [services, setServices] = useState<
    ClientInferResponseBody<typeof contract.listServices, 200>
  >([]);
  const { getToken } = useAuth();

  const getClusterServices = useCallback(async () => {
    const servicesResponse = await client.listServices({
      headers: {
        authorization: `Bearer ${await getToken()}`,
      },
      params: {
        clusterId,
      },
    });

    if (servicesResponse.status === 200) {
      setServices(servicesResponse.body);
    } else {
      createErrorToast(servicesResponse, "Failed to get cluster services");
    }
  }, [clusterId, getToken]);

  useEffect(() => {
    getClusterServices();
  }, [getClusterServices]);

  const sortedServices = services.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <ControlPlaneBox />
      <div className="relative grid grid-cols-1 gap-4">
        {sortedServices.length > 0 && (
          <div className="absolute left-8 top-0 w-[2px] h-full bg-border" />
        )}

        {sortedServices.map((service, index) => (
          <ServiceCard
            key={service.name}
            service={service}
            clusterId={clusterId}
            index={index}
            total={sortedServices.length}
          />
        ))}
      </div>
    </div>
  );
}

export function ClusterDetails({
  clusterId,
}: {
  clusterId: string;
}): JSX.Element {
  const { getToken } = useAuth();
  const [clusterDetails, setClusterDetails] = useState<
    ClientInferResponses<typeof contract.getCluster, 200>["body"] | null
  >(null);
  const [machines, setMachines] = useState<
    ClientInferResponseBody<typeof contract.listMachines, 200>
  >([]);
  const [services, setServices] = useState<
    ClientInferResponseBody<typeof contract.listServices, 200>
  >([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false);

  const fetchData = useCallback(
    async (isInitialFetch: boolean = false) => {
      if (!clusterId) return;
      if (isInitialFetch) {
        setIsInitialLoading(true);
      }

      try {
        const token = await getToken();
        const headers = { authorization: `Bearer ${token}` };
        const params = { clusterId };

        const [clusterResult, machinesResponse, servicesResponse] =
          await Promise.all([
            client.getCluster({ headers, params }),
            client.listMachines({ headers, params }),
            client.listServices({ headers, params }),
          ]);

        if (clusterResult.status === 200) {
          setClusterDetails(clusterResult.body);
        } else {
          ServerConnectionStatus.addEvent({
            type: "getCluster",
            success: false,
          });
        }

        if (machinesResponse.status === 200) {
          setMachines(machinesResponse.body);
        }

        if (servicesResponse.status === 200) {
          setServices(servicesResponse.body);
        }
      } catch (error) {
        console.error("Failed to fetch cluster data:", error);
      } finally {
        if (isInitialFetch) {
          setIsInitialLoading(false);
          setHasInitialDataLoaded(true);
        }
      }
    },
    [clusterId, getToken]
  );

  const pollWithDelay = useCallback(async () => {
    // Initial fetch
    await fetchData(true);

    // Start polling loop
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
      await fetchData(false);
    }
  }, [fetchData]);

  useEffect(() => {
    const abortController = new AbortController();

    if (!hasInitialDataLoaded) {
      pollWithDelay().catch((error) => {
        if (!abortController.signal.aborted) {
          console.error("Polling error:", error);
        }
      });
    }

    return () => {
      abortController.abort();
    };
  }, [pollWithDelay, hasInitialDataLoaded]);

  const liveMachineCount = machines.filter(
    (m) => Date.now() - new Date(m.lastPingAt!).getTime() < 1000 * 60
  ).length;

  return (
    <div className="flex flex-col space-y-3 w-full">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="group relative flex items-center w-full px-5 py-6 bg-white hover:bg-gray-50/80 border border-gray-200 rounded-xl transition-all duration-200 hover:shadow-lg"
          >
            <div className="absolute -top-1.5 -right-1.5">
              {isInitialLoading ? (
                <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-medium text-amber-700">
                    Loading
                  </span>
                </div>
              ) : liveMachineCount > 0 ? (
                <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-full border border-red-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 w-full">
              <div className="h-5 w-5 shrink-0 rounded-xl flex items-center justify-center">
                <Cpu className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-semibold text-gray-900">Machines</span>
                <span className="text-xs text-gray-500 font-mono">
                  {liveMachineCount} Active
                </span>
              </div>
            </div>
          </Button>
        </SheetTrigger>
        <SheetContent
          style={{ minWidth: 800 }}
          className="overflow-y-auto h-screen"
        >
          <SheetHeader className="pb-6">
            <SheetTitle>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Cpu className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="font-mono text-xl">Cluster Health</div>
                  <div className="text-sm text-muted-foreground">
                    Monitor and manage your cluster&apos;s machines
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6">
            {isInitialLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ClusterHealthPane clusterDetails={clusterDetails} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="group relative flex items-center w-full px-5 py-6 bg-white hover:bg-gray-50/80 border border-gray-200 rounded-xl transition-all duration-200 hover:shadow-lg"
          >
            <div className="absolute -top-1.5 -right-1.5">
              {isInitialLoading ? (
                <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-medium text-amber-700">
                    Loading
                  </span>
                </div>
              ) : services.length > 0 ? (
                <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-full border border-red-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 w-full">
              <div className="h-5 w-5 shrink-0 rounded-xl flex items-center justify-center">
                <Blocks className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-semibold text-gray-900">
                  Services
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  {services.reduce(
                    (acc, service) => acc + (service.functions?.length || 0),
                    0
                  )}{" "}
                  Functions
                </span>
              </div>
            </div>
          </Button>
        </SheetTrigger>
        <SheetContent
          style={{ minWidth: "80%" }}
          className="overflow-y-auto h-screen"
        >
          <SheetHeader className="pb-6">
            <SheetTitle>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Blocks className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="font-mono text-xl">Service Details</div>
                  <div className="text-sm text-muted-foreground">
                    Manage and monitor your cluster services
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6">
            {isInitialLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ServicesOverview clusterId={clusterId} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

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

function MachinesOverview({ clusterId }: { clusterId: string }) {
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

export function ClusterHealthPane({
  clusterDetails,
}: {
  clusterDetails:
    | ClientInferResponses<typeof contract.getCluster, 200>["body"]
    | null;
}): JSX.Element {
  return (
    <div>
      {clusterDetails?.id && <MachinesOverview clusterId={clusterDetails.id} />}
    </div>
  );
}
