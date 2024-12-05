"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Blocks, Cpu } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SmallDeadRedCircle, SmallLiveGreenCircle } from "./circles";
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
import { createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody, ClientInferResponses } from "@ts-rest/core";
import { formatRelative } from "date-fns";
import { AppWindowIcon, Layers } from "lucide-react";
import ToolContextButton from "./chat/ToolContextButton";
import { DeadGrayCircle, DeadRedCircle, LiveGreenCircle } from "./circles";
import ErrorDisplay from "./error-display";
import { EventsOverlayButton } from "./events-overlay";
import { ServerConnectionStatus } from "./server-connection-pane";

export type Service = {
  name: string;
  description?: string;
  functions?: {
    name: string;
    description?: string;
    schema?: string;
  }[];
};

function toServiceName(name: string) {
  return <span>{name}</span>;
}

function toFunctionName(name: string, serviceName: string) {
  if (serviceName === "InferableApplications") {
    return <span>Inferable App</span>;
  }

  return <span>{name}</span>;
}

function ServiceCard({
  service,
  clusterId,
}: {
  service: Service;
  clusterId: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/30 p-4 shadow-sm border border-border/50 text-sm">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          {service.name === "InferableApplications" ? (
            <AppWindowIcon className="w-4 h-4 text-primary" />
          ) : (
            <Layers className="w-4 h-4 text-primary" />
          )}
        </div>
        <div>
          <div className="text-sm font-medium">
            {toServiceName(service.name)}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {service.functions?.length || 0} Functions
          </div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">Function</TableHead>
            <TableHead className="w-2/3">Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {service.functions
            ?.sort((a, b) => a.name.localeCompare(b.name))
            .map((func) => (
              <TableRow key={func.name}>
                <TableCell className="w-1/3">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-sm">
                      {toFunctionName(func.name, service.name)}
                    </span>
                    <ToolContextButton
                      clusterId={clusterId}
                      service={service.name}
                      functionName={func.name}
                    />
                  </div>
                </TableCell>
                <TableCell className="w-2/3">
                  {func.description || "No description"}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
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

  return (
    <div>
      <div className="grid grid-cols-1 gap-4">
        {services
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((service) => (
            <ServiceCard
              key={service.name}
              service={service}
              clusterId={clusterId}
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

  const POLLING_INTERVAL = 5000; // 5 seconds

  const fetchData = useCallback(async () => {
    if (!clusterId) return;

    const token = await getToken();
    const headers = { authorization: `Bearer ${token}` };
    const params = { clusterId };

    // Fetch cluster details
    const clusterResult = await client.getCluster({ headers, params });
    if (clusterResult.status === 200) {
      setClusterDetails(clusterResult.body);
    } else {
      ServerConnectionStatus.addEvent({
        type: "getCluster",
        success: false,
      });
    }

    // Fetch machines
    const machinesResponse = await client.listMachines({ headers, params });
    if (machinesResponse.status === 200) {
      setMachines(machinesResponse.body);
    }

    // Fetch services
    const servicesResponse = await client.listServices({ headers, params });
    if (servicesResponse.status === 200) {
      setServices(servicesResponse.body);
    }
  }, [clusterId, getToken]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const liveMachineCount = machines.filter(
    (m) => Date.now() - new Date(m.lastPingAt!).getTime() < 1000 * 60
  ).length;

  const isHealthy = liveMachineCount > 0 && services.length > 0;

  return (
    <div className="flex flex-col space-y-2 w-[160px]">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="border bg-white hover:bg-gray-50 w-full h-10 px-3 justify-start relative"
          >
            <div className="absolute -top-1 right-0">
              {isHealthy ? <SmallLiveGreenCircle /> : <SmallDeadRedCircle />}
            </div>
            <div className="flex items-center gap-2 text-sm w-full">
              <div className="h-6 w-6 shrink-0 rounded-full bg-gray-100 flex items-center justify-center">
                <Cpu className="w-3 h-3 text-gray-600" />
              </div>
              <span>Machines</span>
              <div className="ml-auto text-xs text-muted-foreground">
                {liveMachineCount}
              </div>
            </div>
          </Button>
        </SheetTrigger>
        <SheetContent
          style={{ minWidth: 800 }}
          className="overflow-scroll h-screen"
        >
          <SheetHeader>
            <SheetTitle>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="font-mono">Cluster Health</div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="h-4" />
          <div className="space-y-4">
            <ClusterHealthPane clusterDetails={clusterDetails} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="border bg-white hover:bg-gray-50 w-full h-10 px-3 justify-start relative"
          >
            <div className="absolute -top-1 right-0">
              {isHealthy ? <SmallLiveGreenCircle /> : <SmallDeadRedCircle />}
            </div>
            <div className="flex items-center gap-2 text-sm w-full">
              <div className="h-6 w-6 shrink-0 rounded-full bg-gray-100 flex items-center justify-center">
                <Blocks className="w-3 h-3 text-gray-600" />
              </div>
              <span>Services</span>
              <div className="ml-auto text-xs text-muted-foreground">
                {services.length}
              </div>
            </div>
          </Button>
        </SheetTrigger>
        <SheetContent
          style={{ minWidth: "80%" }}
          className="overflow-scroll h-screen"
        >
          <SheetHeader>
            <SheetTitle>
              <span className="font-mono">Service Details</span>
            </SheetTitle>
          </SheetHeader>
          <div className="h-4" />
          <div className="space-y-4">
            <ServicesOverview clusterId={clusterId} />
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
  return (
    <div className="rounded-xl bg-secondary/30 p-4 shadow-sm border border-border/50">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
        <div>
          {Date.now() - new Date(machine.lastPingAt!).getTime() < 1000 * 60 ? (
            <LiveGreenCircle />
          ) : (
            <DeadGrayCircle />
          )}
        </div>
        <div>
          <div className="text-sm font-medium font-mono">{machine.id}</div>
          <div className="text-xs text-muted-foreground">{machine.ip}</div>
        </div>
        <EventsOverlayButton
          clusterId={clusterId}
          query={{ machineId: machine.id }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Last heartbeat: {formatRelative(machine.lastPingAt!, new Date())}
      </div>
    </div>
  );
}

function MachinesOverview({ clusterId }: { clusterId: string }) {
  const [machines, setMachines] = useState<
    ClientInferResponseBody<typeof contract.listMachines, 200>
  >([]);
  const [liveMachineCount, setLiveMachineCount] = useState(0);
  const { getToken } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [error, setError] = useState<any>(null);

  const getClusterMachines = useCallback(async () => {
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
  }, [clusterId, getToken]);

  useEffect(() => {
    getClusterMachines();

    const interval = setInterval(getClusterMachines, 1000 * 10);
    return () => clearInterval(interval);
  }, [getClusterMachines]);

  if (error) {
    return <ErrorDisplay status={error.status} error={error} />;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Machines</h2>
      <p className="text-sm text-muted-foreground mb-4">
        You have {liveMachineCount} machine
        {liveMachineCount === 1 ? "" : "s"} connected.
      </p>
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
          <div className="col-span-full text-center p-4 rounded-xl bg-secondary/30 border border-border/50">
            <DeadRedCircle />
            <span className="ml-2">Your machines are offline.</span>
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
