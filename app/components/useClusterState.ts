import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { client } from "@/client/client";
import type { contract } from "@/client/contract";
import { ClientInferResponseBody } from "@ts-rest/core";
import { useHashState } from "@/lib/use-hash-state";

export type ClusterResponse = ClientInferResponseBody<typeof contract.getCluster, 200>;

interface ServiceFunction {
  name: string;
  description?: string;
  schema?: string;
  config?: any;
}

interface ServiceDefinition {
  description?: string;
  functions?: ServiceFunction[];
}

export interface Service {
  name: string;
  description?: string;
  timestamp: Date;
  functions?: ServiceFunction[];
}

export interface ClusterState {
  machines: ClusterResponse["machines"];
  services: Service[];
  cluster: ClusterResponse | null;
  liveMachineCount: number;
  isLoading: boolean;
}

let lastFetchAt = 0;
let lastResponse: { status: 200; body: ClusterResponse } | null = null;

const fetchCluster = async (
  token: string,
  clusterId: string,
  pollInterval: number
): Promise<{ status: 200; body: ClusterResponse } | null> => {
  const inInterval = Date.now() - lastFetchAt < pollInterval;

  if (inInterval && lastResponse) {
    return lastResponse;
  }

  try {
    const response = await client.getCluster({
      headers: {
        authorization: `Bearer ${token}`,
      },
      params: {
        clusterId,
      },
    });

    if (response?.status === 200) {
      lastFetchAt = Date.now();
      lastResponse = response;
      return response;
    }
    return null;
  } catch (error) {
    return null;
  }
};

export function useClusterState(clusterId: string, polling = true): ClusterState {
  const [machines, setMachines] = useHashState<ClusterState["machines"]>([]);
  const [services, setServices] = useHashState<ClusterState["services"]>([]);
  const [cluster, setCluster] = useHashState<ClusterResponse | null>(null);
  const [liveMachineCount, setLiveMachineCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const { getToken } = useAuth();

  const fetchClusterState = useCallback(async () => {
    try {
      const token = await getToken();

      if (!token) {
        setError("No token");
        return;
      }

      const clusterResponse = await fetchCluster(token, clusterId, 5000);

      if (!clusterResponse) {
        setError("Failed to fetch cluster data");
        return;
      }

      if (clusterResponse.status === 200) {
        setCluster(clusterResponse.body);
        setMachines(clusterResponse.body.machines ?? []);

        // Transform services to match the expected format
        const transformedServices = (clusterResponse.body.services ?? []).map(
          (service): Service => {
            const definition = service.definition as ServiceDefinition | null;
            return {
              name: service.service,
              timestamp: service.timestamp ?? new Date(),
              description: definition?.description,
              functions: definition?.functions?.map(
                (fn: ServiceFunction): ServiceFunction => ({
                  name: fn.name,
                  description: fn.description,
                  schema: fn.schema,
                  config: fn.config,
                })
              ),
            };
          }
        );
        setServices(transformedServices);

        setLiveMachineCount(
          (clusterResponse.body.machines ?? []).filter(
            machine =>
              machine.lastPingAt && Date.now() - new Date(machine.lastPingAt).getTime() < 1000 * 60
          ).length
        );
        setError(null);
      } else {
        setError("Invalid response");
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [clusterId, getToken]);

  useEffect(() => {
    let isSubscribed = true;

    const poll = async () => {
      if (!isSubscribed) return;
      await fetchClusterState();

      if (polling) {
        setTimeout(poll, 5000);
      }
    };

    poll();

    return () => {
      isSubscribed = false;
    };
  }, [fetchClusterState]);

  return {
    machines,
    services,
    cluster,
    liveMachineCount,
    isLoading,
  };
}
