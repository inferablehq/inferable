import { createClerkClient } from '@clerk/backend'
import { env } from '../../utilities/env'
import { logger } from '../observability/logger'
import { clusters, db } from '../data';
import { eq } from 'drizzle-orm';

const getOrgIdForClusterId = async (cluserId: string) => {
  const [cluster] = await db.select({
    organizationId: clusters.organization_id
  }).from(clusters).where(eq(clusters.id, cluserId));

  return cluster?.organizationId
}

const getUserForOrg = async (emailAddress: string, organizationId: string) => {
  if (!env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY is not set")
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })

  const list = await clerk.users.getUserList({ emailAddress: [emailAddress], organizationId: [organizationId] })

  if (list.totalCount > 1) {
    logger.warn("Multiple users found with the same email address and organizationId")
  }

  return list.data.pop();
}

export const getUserForCluster = async ({
  emailAddress,
  clusterId
}: {
  emailAddress: string;
  clusterId: string;
}) => {
  const organizationId = await getOrgIdForClusterId(clusterId);

  if (!organizationId) {
    throw new Error("Can not lookup user without organizationId")
  }

  return getUserForOrg(emailAddress, organizationId);
}
