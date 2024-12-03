import { client } from "@/client/client";
import { GlobalBreadcrumbs } from "@/components/breadcrumbs";
import { ClusterCard } from "@/components/cluster-card";
import { CreateClusterButton } from "@/components/create-cluster-button";
import { auth } from "@clerk/nextjs";
import { Lightbulb } from "lucide-react";

export const metadata = {
  title: "Clusters",
};

async function App() {
  const response = await client.listClusters({
    headers: {
      authorization: `Bearer ${await auth().getToken()}`,
    },
  });

  if (response.status !== 200) {
    return null;
  }

  const availableClusters = response.body;

  return (
    <>
      <GlobalBreadcrumbs />
      <div className="p-6">
        <div className="">
          <h1 className="text-2xl">Clusters</h1>
        </div>
        <div className="h-4" />

        {availableClusters && availableClusters.length > 0 ? (
          <div className="flex flex-wrap">
            {availableClusters.map((cluster) => (
              <ClusterCard key={cluster.id} cluster={cluster} />
            ))}
            <div className="flex justify-center items-center bg-gray-50 rounded-lg w-[400px] border-dashed border-2 border-gray-300 h-[220px]">
              <CreateClusterButton />
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900">
              <Lightbulb className="w-4 h-4 inline-block mr-2" />
              Create your first cluster
            </h3>
            <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
              Clusters help you group your functions, machines, and runs.
            </p>
            <div className="mt-6">
              <CreateClusterButton />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
