import { cleanupMarkedClusters } from ".";
import { createCluster } from "./management";
import * as data from "../data";
import { count, eq, or } from "drizzle-orm";

describe("clusters", () => {
  describe("cleanupMarkedClusters", () => {
    it("should delete clusters that are marked for deletion", async () => {
      const cluster = await createCluster({
        description: "To be deleted",
        organizationId: "test-org-id",
      });

      await data.db
        .update(data.clusters)
        .set({
          deleted_at: new Date(Date.now() - 1000 * 60 * 60 * 24),
        })
        .where(eq(data.clusters.id, cluster.id));

      await cleanupMarkedClusters();

      const [exists] = await data.db
        .select({ count: count(data.clusters.id) })
        .from(data.clusters)
        .where(eq(data.clusters.id, cluster.id));

      expect(exists.count).toBe(0);
    });

    it("should ignore clusters which are not marked for deletion", async () => {
      // Create a cluster without marking it
      const cluster = await createCluster({
        description: "Should remain",
        organizationId: "test-org-id",
      });

      await cleanupMarkedClusters();

      const [exists] = await data.db
        .select({ count: count(data.clusters.id) })
        .from(data.clusters)
        .where(eq(data.clusters.id, cluster.id));

      expect(exists.count).toBe(1);
    });

    it("should handle multiple clusters correctly", async () => {
      // Create multiple clusters
      await createCluster({
        name: "Active Cluster",
        description: "Should remain",
        organizationId: "test-org-id",
      });

      const markedCluster1 = await createCluster({
        name: "Marked Cluster 1",
        description: "To be deleted",
        organizationId: "test-org-id",
      });
      const markedCluster2 = await createCluster({
        name: "Marked Cluster 2",
        description: "To be deleted",
        organizationId: "test-org-id",
      });

      await data.db
        .update(data.clusters)
        .set({
          deleted_at: new Date(Date.now() - 1000 * 60 * 60 * 24),
        })
        .where(
          or(
            eq(data.clusters.id, markedCluster1.id),
            eq(data.clusters.id, markedCluster2.id),
          ),
        );

      await cleanupMarkedClusters();

      const [exists] = await data.db
        .select({ count: count(data.clusters.id) })
        .from(data.clusters)
        .where(
          or(
            eq(data.clusters.id, markedCluster1.id),
            eq(data.clusters.id, markedCluster2.id),
          ),
        );

      expect(exists.count).toBe(0);
    });
  });
});
