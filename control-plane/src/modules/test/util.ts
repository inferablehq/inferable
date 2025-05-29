import * as data from "../data";

export const createOwner = async (params?: {
  clusterId?: string;
  organizationId?: string;
}) => {
  const clusterId = params?.clusterId || `test-cluster-${Math.random()}`;

  const userId = `test-owner-${Math.random()}`;
  const organizationId = params?.organizationId || `test-org-${Math.random()}`;

  await data.db
    .insert(data.clusters)
    .values({
      id: clusterId,
      name: clusterId,
      organization_id: organizationId,
    })
    .execute();

  await data.db.insert(data.services).values({
    cluster_id: clusterId,
    service: "testService",
  });

  return { clusterId, userId, organizationId };
};
