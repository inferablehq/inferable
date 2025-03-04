import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { client } from "@/client/client";
import type { contract } from "@/client/contract";
import { ClientInferResponseBody } from "@ts-rest/core";
import { useHashState } from "@/lib/use-hash-state";

export type ClusterResponse = ClientInferResponseBody<
  typeof contract.getCluster,
  200
>;

export interface ClusterState {
  machines: ClusterResponse["machines"];
  tools: ClusterResponse["tools"];
  cluster: ClusterResponse | null;
  liveMachineCount: number;
  isLoading: boolean;
}

let lastFetchAt = 0;
let lastResponse: { status: 200; body: ClusterResponse } | null = null;

const fetchCluster = async (
  token: string,
  clusterId: string,
  pollInterval: number,
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

export function useClusterState(
  clusterId: string,
  polling = true,
): ClusterState {
  const [machines, setMachines] = useHashState<ClusterState["machines"]>([]);
  const [tools, setTools] = useHashState<ClusterState["tools"]>([]);
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
        setTools(clusterResponse.body.tools ?? []);

        setLiveMachineCount(
          (clusterResponse.body.machines ?? []).filter(
            (machine) =>
              machine.lastPingAt &&
              Date.now() - new Date(machine.lastPingAt).getTime() < 1000 * 60,
          ).length,
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
  }, [clusterId, getToken, setCluster, setMachines, setTools]);

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
  }, [fetchClusterState, clusterId, polling]);

  return {
    machines,
    tools,
    cluster,
    liveMachineCount,
    isLoading,
  };
}
