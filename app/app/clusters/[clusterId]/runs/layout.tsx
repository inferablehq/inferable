import { client } from "@/client/client";
import { ClusterDetails } from "@/components/cluster-details";
import { RunList } from "@/components/WorkflowList";
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
  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6">
      <div className="w-full lg:w-[300px] flex-shrink-0">
        <RunList clusterId={clusterId} />
      </div>
      <div className="w-full max-w-[1024px]">
        {children}
      </div>
      <div className="w-full lg:w-[200px] flex-shrink-0">
        <ClusterDetails clusterId={clusterId} />
      </div>
    </div>
  );
}


