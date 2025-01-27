"use client";

import { useEffect } from "react";
import { client } from "@/client/client";
import { ClusterRunsLayout } from "@/components/cluster-runs-layout";
import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

export default function Home({
  params: { clusterId },
  children,
}: {
  params: {
    clusterId: string;
  };
  children: React.ReactNode;
}) {
  const { getToken } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const fetchMetadata = async () => {
      const token = await getToken();
      const cluster = await client.getCluster({
        headers: { authorization: `Bearer ${token}` },
        params: { clusterId },
      });

      if (cluster.status === 200 && cluster.body?.name) {
        document.title = cluster.body.name;
      } else {
        document.title = "Inferable";
      }
    };

    fetchMetadata();
  }, [clusterId, getToken, pathname]);

  return <ClusterRunsLayout clusterId={clusterId}>{children}</ClusterRunsLayout>;
}
