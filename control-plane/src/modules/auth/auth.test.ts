import { ulid } from "ulid";
import { createOwner } from "../test/util";
import { createRun, createRunWithMessage } from "../runs";
import * as clusterAuth from "./cluster";
import * as clerkAuth from "./clerk";
import { Auth, extractAuthState } from "./auth";
import { redisClient } from "../dependencies/redis";

jest.mock("../../utilities/env");

// Mocking API Secret / JWT verification, there are seperate tests for these
const mockClusterAuth = {
  verifyApiKey: jest.spyOn(clusterAuth, "verify"),
  isApiSecret: jest.spyOn(clusterAuth, "isApiSecret"),
};

const mockClerkAuth = {
  verify: jest.spyOn(clerkAuth, "verify"),
};

describe("extractAuthState", () => {
  beforeAll(async () => {
    // Ensure Redis client is connected
    await redisClient?.connect();
  });

  afterAll(async () => {
    // Close Redis connection after all tests
    await redisClient?.quit();
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    // Clear all keys in Redis before each test
    await redisClient?.flushAll();
  });

  it("should return undefined if no valid token found", async () => {
    const result = await extractAuthState("");
    expect(result).toEqual(undefined);
  });

  describe("ApiKeyAuth", () => {
    const apiKeyTypes = ["API KEY"];

    it("should extract ApiKeyAuth from valid API secret", async () => {
      mockClusterAuth.isApiSecret.mockReturnValue(true);
      mockClusterAuth.verifyApiKey.mockResolvedValue({
        organizationId: "org_1",
        clusterId: "cluster_1",
        id: ulid(),
      });

      const result = await extractAuthState("");
      expect(result).toMatchObject({
        organizationId: "org_1",
        clusterId: "cluster_1",
        canAccess: expect.any(Function),
      });
    });

    describe("isUser", () => {
      describe.each(apiKeyTypes)("for %s", () => {
        it("should throw", async () => {
          mockClusterAuth.isApiSecret.mockReturnValue(true);
          mockClusterAuth.verifyApiKey.mockResolvedValue({
            organizationId: "org_1",
            clusterId: "cluster_1",
            id: ulid(),
          });

          const result = await extractAuthState("");

          expect(() => result!.isClerk()).toThrow();
        });
      });
    });

    describe("canAccess", () => {
      describe("cluster", () => {
        describe.each(apiKeyTypes)("for %s", () => {
          it("should succeed for same cluster", async () => {
            mockClusterAuth.isApiSecret.mockReturnValue(true);
            mockClusterAuth.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });

            const result = await extractAuthState("");
            await expect(
              result!.canAccess({ cluster: { clusterId: "cluster_1" } }),
            ).resolves.toBeDefined();
          });

          it("should throw for different cluster", async () => {
            mockClusterAuth.isApiSecret.mockReturnValue(true);
            mockClusterAuth.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });

            const result = await extractAuthState("");
            await expect(
              result!.canAccess({ cluster: { clusterId: "cluster_2" } }),
            ).rejects.toThrow();
          });
        });
      });

      describe("run", () => {
        // API Keys can access runs
        describe.each(apiKeyTypes)("for %s", () => {
          it("should succeed", async () => {
            mockClusterAuth.isApiSecret.mockReturnValue(true);
            mockClusterAuth.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });
            const result = await extractAuthState("");
            await expect(
              result!.canAccess({
                run: {
                  clusterId: "cluster_1",
                  runId: "run_1",
                },
              }),
            ).resolves.toBeDefined();
          });
        });
      });
    });

    describe("canManage", () => {
      // API Keys can manage runs
      describe("run", () => {
        describe.each(apiKeyTypes)("for %s", () => {
          it("should succeed", async () => {
            mockClusterAuth.isApiSecret.mockReturnValue(true);
            mockClusterAuth.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });

            const result = await extractAuthState("");
            await expect(
              result!.canManage({
                run: {
                  clusterId: "cluster_1",
                  runId: "run_1",
                },
              }),
            ).resolves.toBeDefined();
          });
        });
      });
      describe("cluster", () => {
        // API Keys cannot manage cluster
        describe.each(apiKeyTypes)("for %s", () => {
          it("should throw", async () => {
            mockClusterAuth.isApiSecret.mockReturnValue(true);
            mockClusterAuth.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });

            const result = await extractAuthState("");
            await expect(
              result!.canManage({ cluster: { clusterId: "cluster_1" } }),
            ).rejects.toThrow();
          });
        });
      });
    });

    describe("canCreate", () => {
      // API keys cannot create clusters
      describe("cluster", () => {
        describe.each(apiKeyTypes)("for %s", () => {
          it("should throw", async () => {
            mockClusterAuth.isApiSecret.mockReturnValue(true);
            mockClusterAuth.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });

            const result = await extractAuthState("");
            expect(() => result!.canCreate({ cluster: true })).toThrow();
          });
        });
      });

      describe("run", () => {
        // API keys can create runs
        describe.each(apiKeyTypes)("for %s", () => {
          it("should succeed", async () => {
            mockClusterAuth.isApiSecret.mockReturnValue(true);
            mockClusterAuth.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });

            const result = await extractAuthState("");
            expect(() => result!.canCreate({ run: true })).toBeDefined();
          });
        });
      });
    });
  });

  describe("ClerkAuth", () => {
    it("should extract UserAuth from valid JWT token", async () => {
      mockClerkAuth.verify.mockResolvedValue({
        userId: "cluster_1",
        orgId: "org_1",
        orgRole: "org:member",
      });

      const result = await extractAuthState("");
      expect(result).toMatchObject({
        entityId: "clerk:cluster_1",
        organizationId: "org_1",
        organizationRole: "org:member",
        canAccess: expect.any(Function),
        canManage: expect.any(Function),
        isAdmin: expect.any(Function),
      });
    });

    it("should allow access to owned cluster only", async () => {
      const owner = await createOwner();

      mockClerkAuth.verify.mockResolvedValue({
        userId: owner.userId,
        orgId: owner.organizationId,
        orgRole: "org:member",
      });

      const result = await extractAuthState("");
      expect(result).toMatchObject({
        entityId: `clerk:${owner.userId}`,
        organizationId: owner.organizationId,
        organizationRole: "org:member",
        canAccess: expect.any(Function),
        canManage: expect.any(Function),
        isAdmin: expect.any(Function),
      });

      await expect(
        result?.canAccess({
          cluster: { clusterId: owner.clusterId },
        }),
      ).resolves.toBeDefined();

      // Incorrect cluster ID
      await expect(
        result?.canAccess({ cluster: { clusterId: "cluster_2" } }),
      ).rejects.toThrow();
    });

    describe("runs", () => {
      let owner1: Awaited<ReturnType<typeof createOwner>>;
      let owner2: Awaited<ReturnType<typeof createOwner>>;
      let owner1AuthState: Auth | undefined;
      let owner2AuthState: Auth | undefined;
      let run1: any;
      let run2: any;
      const organizationId = Math.random().toString();

      beforeAll(async () => {
        owner1 = await createOwner({ organizationId });
        owner2 = await createOwner({ organizationId });

        mockClerkAuth.verify.mockResolvedValueOnce({
          userId: owner1.userId,
          orgId: owner1.organizationId,
          orgRole: "org:member",
        });

        owner1AuthState = await extractAuthState("");
        expect(owner1AuthState).toMatchObject({
          entityId: `clerk:${owner1.userId}`,
          organizationId: owner1.organizationId,
          organizationRole: "org:member",
          canAccess: expect.any(Function),
          canManage: expect.any(Function),
          isAdmin: expect.any(Function),
        });

        mockClerkAuth.verify.mockResolvedValueOnce({
          userId: owner2.userId,
          orgId: owner2.organizationId,
          orgRole: "org:member",
        });

        owner2AuthState = await extractAuthState("");
        expect(owner2AuthState).toMatchObject({
          entityId: `clerk:${owner2.userId}`,
          organizationId: owner2.organizationId,
          organizationRole: "org:member",
          canAccess: expect.any(Function),
          canManage: expect.any(Function),
          isAdmin: expect.any(Function),
        });

        run1 = await createRunWithMessage({
          userId: owner1AuthState!.entityId,
          clusterId: owner1.clusterId,
          message: "hello",
          type: "human",
        });

        run2 = await createRunWithMessage({
          userId: owner2AuthState!.entityId,
          clusterId: owner2.clusterId,
          message: "hello",
          type: "human",
        });
      });

      describe("canManage", () => {
        it("should allow user to only manage their own runs", async () => {
          await expect(
            owner1AuthState?.canManage({
              run: {
                runId: run1.id,
                clusterId: run1.clusterId,
              },
            }),
          ).resolves.toBeDefined();

          await expect(
            owner1AuthState?.canManage({
              run: {
                runId: run2.id,
                clusterId: run2.clusterId,
              },
            }),
          ).rejects.toThrow();

          await expect(
            owner2AuthState?.canManage({
              run: {
                runId: run2.id,
                clusterId: run2.clusterId,
              },
            }),
          ).resolves.toBeDefined();

          await expect(
            owner2AuthState?.canManage({
              run: {
                runId: run1.id,
                clusterId: run1.clusterId,
              },
            }),
          ).rejects.toThrow();
        });

        it("should allow admin to manage runs in their organization", async () => {
          const admin = await createOwner({ organizationId });

          mockClerkAuth.verify.mockResolvedValueOnce({
            userId: admin.userId,
            orgId: admin.organizationId,
            orgRole: "org:admin",
          });

          const ownerAuthState = await extractAuthState("");
          expect(ownerAuthState).toMatchObject({
            entityId: `clerk:${admin.userId}`,
            organizationId: admin.organizationId,
            organizationRole: "org:admin",
            canAccess: expect.any(Function),
            canManage: expect.any(Function),
            isAdmin: expect.any(Function),
          });

          await expect(
            ownerAuthState?.canManage({
              run: {
                runId: run1.id,
                clusterId: run1.clusterId,
              },
            }),
          ).resolves.toBeDefined();

          await expect(
            ownerAuthState?.canManage({
              run: {
                runId: run2.id,
                clusterId: run2.clusterId,
              },
            }),
          ).resolves.toBeDefined();
        });

        it("should not allow admin to manage runs outside their organization", async () => {
          const admin = await createOwner();

          mockClerkAuth.verify.mockResolvedValueOnce({
            userId: admin.userId,
            orgId: admin.organizationId,
            orgRole: "org:admin",
          });

          const ownerAuthState = await extractAuthState("");
          expect(ownerAuthState).toMatchObject({
            entityId: `clerk:${admin.userId}`,
            organizationId: admin.organizationId,
            organizationRole: "org:admin",
            canAccess: expect.any(Function),
            canManage: expect.any(Function),
            isAdmin: expect.any(Function),
          });

          await expect(
            ownerAuthState?.canManage({
              run: {
                runId: run1.id,
                clusterId: run1.clusterId,
              },
            }),
          ).rejects.toThrow();

          await expect(
            ownerAuthState?.canManage({
              run: {
                runId: run2.id,
                clusterId: run2.clusterId,
              },
            }),
          ).rejects.toThrow();
        });
      });
    });
  });
});
