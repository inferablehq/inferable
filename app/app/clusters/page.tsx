import { client } from "@/client/client";
import { GlobalBreadcrumbs } from "@/components/breadcrumbs";
import { ClustersTable } from "@/components/clusters-table";
import ErrorDisplay from "@/components/error-display";
import { auth } from "@clerk/nextjs";

export const metadata = {
  title: "Clusters",
};

async function App() {
  let error = null;

  const response = await client
    .listClusters({
      headers: {
        authorization: `Bearer ${await auth().getToken()}`,
      },
    })
    .catch((e) => {
      console.error(e);
      error = e;
      return null;
    });

  if (error) {
    return <ErrorDisplay error={error} status={-1} />;
  }

  if (response?.status !== 200) {
    return <ErrorDisplay error={error} status={response?.status} />;
  }

  const availableClusters = response.body;

  return (
    <>
      <GlobalBreadcrumbs />
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl">Clusters</h1>
        </div>

        <ClustersTable clusters={availableClusters} />
      </div>
    </>
  );
}

export default App;
