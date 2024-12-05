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
import { ClientInferResponseBody } from "@ts-rest/core";
import { AppWindowIcon, Layers, Cpu } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ToolContextButton from "./chat/ToolContextButton";

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
