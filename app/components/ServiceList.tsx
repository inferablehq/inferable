"use client";

import { client } from "@/client/client";
import { contract } from "@/client/contract";
import { useAuth } from "@clerk/nextjs";
import { ClientInferResponseBody } from "@ts-rest/core";
import { AppWindowIcon, Blocks, Network } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SmallLiveGreenCircle } from "./circles";
import ToolContextButton from "./chat/ToolContextButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { cn, createErrorToast } from "@/lib/utils";
import { formatDistance } from "date-fns";

function toServiceName(name: string) {
  return <span>{name}</span>;
}

function toFunctionName(name: string) {
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
                            {toFunctionName(func.name)}
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

export function ServiceList({ clusterId }: { clusterId: string }) {
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
