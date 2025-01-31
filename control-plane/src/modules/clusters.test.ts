import { getClusterContextText, cleanupMarkedClusters } from "./cluster";
import { createCluster, editClusterDetails } from "./management";
import * as data from "./data";
import { count, eq, or } from "drizzle-orm";

describe("clusters", () => {
  it("should strip HTML tags from cluster context", async () => {
    const cluster = await createCluster({
      name: "Test Cluster",
      description: "Test Description",
      organizationId: "test-org-id",
    });

    // Update cluster with HTML content
    await editClusterDetails({
      organizationId: "test-org-id",
      clusterId: cluster.id,
      name: "Test Cluster",
      description: "Test Description",
      additionalContext: {
        current: {
          version: "1",
          content: "<h1>Hello</h1><p>This is <strong>formatted</strong> text.</p>",
        },
        history: [],
      },
    });

    // Get the cluster context text
    const contextText = await getClusterContextText(cluster.id);

    // Assert that HTML tags are stripped
    expect(contextText).toBe("HelloThis is formatted text.");
  });

  it("should return the latest version of the context", async () => {
    const cluster = await createCluster({
      name: "Test Cluster",
      description: "Test Description",
      organizationId: "test-org-id",
    });

    // Update cluster with multiple versions
    await editClusterDetails({
      organizationId: "test-org-id",
      clusterId: cluster.id,
      name: "Test Cluster",
      description: "Test Description",
      additionalContext: {
        current: {
          version: "2",
          content: "<p>Version 2 content</p>",
        },
        history: [
          {
            version: "1",
            content: "<p>Version 1 content</p>",
          },
        ],
      },
    });

    // Get the cluster context text
    const contextText = await getClusterContextText(cluster.id);

    // Assert that the latest version is returned
    expect(contextText).toBe("Version 2 content");
  });

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
          or(eq(data.clusters.id, markedCluster1.id), eq(data.clusters.id, markedCluster2.id))
        );

      await cleanupMarkedClusters();

      const [exists] = await data.db
        .select({ count: count(data.clusters.id) })
        .from(data.clusters)
        .where(
          or(eq(data.clusters.id, markedCluster1.id), eq(data.clusters.id, markedCluster2.id))
        );

      expect(exists.count).toBe(0);
    });
  });
});
