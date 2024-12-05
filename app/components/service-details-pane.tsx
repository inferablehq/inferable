import ServicesOverview from "@/components/services-overview";
import { type ClusterDetails } from "@/lib/types";

export function ServiceDetailsPane({
  clusterDetails,
}: {
  clusterDetails: ClusterDetails | null;
}): JSX.Element {
  if (!clusterDetails) {
    return <div>No services available</div>;
  }

  return <ServicesOverview clusterId={clusterDetails.id} />;
}
