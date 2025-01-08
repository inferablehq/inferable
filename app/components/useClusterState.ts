import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { client } from "@/client/client";
import type { contract } from "@/client/contract";
import { ClientInferResponseBody } from "@ts-rest/core";

export interface ClusterState {
  machines: ClientInferResponseBody<typeof contract.listMachines, 200>;
  services: ClientInferResponseBody<typeof contract.listServices, 200>;
  cluster: ClientInferResponseBody<typeof contract.getCluster, 200> | null;
  liveMachineCount: number;
  isLoading: boolean;
}

export function useClusterState(clusterId: string): ClusterState {
  const [machines, setMachines] = useState<
    ClientInferResponseBody<typeof contract.listMachines, 200>
  >([]);
  const [services, setServices] = useState<
    ClientInferResponseBody<typeof contract.listServices, 200>
  >([]);
  const [cluster, setCluster] = useState<ClientInferResponseBody<
    typeof contract.getCluster,
    200
  > | null>(null);
  const [liveMachineCount, setLiveMachineCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const { getToken } = useAuth();

  // Fetch cluster info once when component mounts
  useEffect(() => {
    const fetchCluster = async () => {
      try {
        const clusterResponse = await client.getCluster({
          headers: {
            authorization: `Bearer ${await getToken()}`,
          },
          params: {
            clusterId,
          },
        });

        if (clusterResponse.status === 200) {
          setCluster(clusterResponse.body);
        }
      } catch (err) {
        console.error("Failed to fetch cluster:", err);
      }
    };

    fetchCluster();
  }, [clusterId, getToken]);

  const fetchClusterState = useCallback(async () => {
    try {
      const [machinesResponse, servicesResponse] = await Promise.all([
        client.listMachines({
          headers: {
            authorization: `Bearer ${await getToken()}`,
          },
          params: {
            clusterId,
          },
        }),
        client.listServices({
          headers: {
            authorization: `Bearer ${await getToken()}`,
          },
          params: {
            clusterId,
          },
        }),
      ]);

      if (machinesResponse.status === 200 && servicesResponse.status === 200) {
        setMachines(machinesResponse.body);
        setServices(servicesResponse.body);
        setLiveMachineCount(
          machinesResponse.body.filter(
            m => Date.now() - new Date(m.lastPingAt!).getTime() < 1000 * 60
          ).length
        );
        setError(null);
      } else {
        setError({
          machines: machinesResponse.status !== 200 ? machinesResponse : null,
          services: servicesResponse.status !== 200 ? servicesResponse : null,
        });
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
      setTimeout(poll, 5000); // Schedule next poll after 5 seconds
    };

    poll(); // Start polling

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
