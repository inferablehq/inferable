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

function Home({
  params: { clusterId },
  children,
}: {
  params: {
    clusterId: string;
  };
  children: React.ReactNode;
}) {
  return (
    <main className="flex-grow">
      <div className="flex space-x-6 pt-6 pb-6 pl-6 pr-2">
        <RunList clusterId={clusterId} />
        <div className="w-7/12 flex flex-col space-y-2 overflow-auto">
          {children}
        </div>
        <div className="w-1/12 flex flex-col">
          <ClusterDetails clusterId={clusterId} />
        </div>
      </div>
    </main>
  );
}

export default Home;
