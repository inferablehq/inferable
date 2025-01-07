import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { client } from "@/client/client";
import type { contract } from "@/client/contract";
import { ClientInferResponseBody } from "@ts-rest/core";

export interface ClusterState {
  machines: ClientInferResponseBody<typeof contract.listMachines, 200>;
  services: ClientInferResponseBody<typeof contract.listServices, 200>;
  liveMachineCount: number;
}

export function useClusterState(clusterId: string): ClusterState {
  const [machines, setMachines] = useState<
    ClientInferResponseBody<typeof contract.listMachines, 200>
  >([]);
  const [services, setServices] = useState<
    ClientInferResponseBody<typeof contract.listServices, 200>
  >([]);
  const [liveMachineCount, setLiveMachineCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const { getToken } = useAuth();

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
    liveMachineCount,
  };
}
