import { client } from "@/client/client";
import { ClusterRunsLayout } from "@/components/cluster-runs-layout";
import { auth } from "@clerk/nextjs";

export async function generateMetadata({
  params: { clusterId },
}: {
  params: { clusterId: string };
}) {
  const { getToken } = auth();
  const token = await getToken();

  const cluster = await client.getCluster({
    headers: { authorization: `Bearer ${token}` },
    params: { clusterId },
  });

  if (cluster.status !== 200) {
    return { title: "Inferable" };
  }

  return { title: `${cluster.body?.name}` };
}

export default function Home({
  params: { clusterId },
  children,
}: {
  params: {
    clusterId: string;
  };
  children: React.ReactNode;
}) {
  return <ClusterRunsLayout clusterId={clusterId}>{children}</ClusterRunsLayout>;
}
