import { ulid } from "ulid";
import { createOwner } from "../test/util";
import { Run, createRun, createRunWithMessage } from "../workflows/workflows";
import * as customerAuth from "./customer-auth";
import * as apiSecret from "./api-secret";
import {
  Auth,
  ClerkAuth,
  extractAuthState,
  extractCustomerAuthState,
} from "./auth";
import * as jwtToken from "./clerk-token";
import { redisClient } from "../redis";

jest.mock("../../utilities/env");

// Mocking API Secret / JWT verification, there are seperate tests for these
const mockApiSecret = {
  verifyApiKey: jest.spyOn(apiSecret, "verifyApiKey"),
  isApiSecret: jest.spyOn(apiSecret, "isApiSecret"),
};

// Mocking customer provided auth verification
const mockCustomer = {
  verifyCustomerProvidedAuth: jest.spyOn(
    customerAuth,
    "verifyCustomerProvidedAuth",
  ),
};

const mockJwt = {
  verify: jest.spyOn(jwtToken, "verifyClerkToken"),
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
      mockApiSecret.isApiSecret.mockReturnValue(true);
      mockApiSecret.verifyApiKey.mockResolvedValue({
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
          mockApiSecret.isApiSecret.mockReturnValue(true);
          mockApiSecret.verifyApiKey.mockResolvedValue({
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
            mockApiSecret.isApiSecret.mockReturnValue(true);
            mockApiSecret.verifyApiKey.mockResolvedValue({
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
            mockApiSecret.isApiSecret.mockReturnValue(true);
            mockApiSecret.verifyApiKey.mockResolvedValue({
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
            mockApiSecret.isApiSecret.mockReturnValue(true);
            mockApiSecret.verifyApiKey.mockResolvedValue({
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
            mockApiSecret.isApiSecret.mockReturnValue(true);
            mockApiSecret.verifyApiKey.mockResolvedValue({
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
            mockApiSecret.isApiSecret.mockReturnValue(true);
            mockApiSecret.verifyApiKey.mockResolvedValue({
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

      describe("template", () => {
        // API Keys can manage templates
        describe.each(apiKeyTypes)("for %s", (type) => {
          it("should succeed", async () => {
            mockApiSecret.isApiSecret.mockReturnValue(true);
            mockApiSecret.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });

            const result = await extractAuthState("");

            expect(() =>
              result!.canManage({
                config: { clusterId: "cluster_1", configId: "template_1" },
              }),
            ).toBeDefined();
          });
        });
      });
    });

    describe("canCreate", () => {
      // API keys cannot create clusters
      describe("cluster", () => {
        describe.each(apiKeyTypes)("for %s", (type) => {
          it("should throw", async () => {
            mockApiSecret.isApiSecret.mockReturnValue(true);
            mockApiSecret.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });

            const result = await extractAuthState("");
            expect(() => result!.canCreate({ cluster: true })).toThrow();
          });
        });
      });

      describe("template", () => {
        // API keys can create templates
        describe.each(apiKeyTypes)("for %s", (type) => {
          it("should succeed", async () => {
            mockApiSecret.isApiSecret.mockReturnValue(true);
            mockApiSecret.verifyApiKey.mockResolvedValue({
              organizationId: "org_1",
              clusterId: "cluster_1",
              id: ulid(),
            });

            const result = await extractAuthState("");
            expect(() => result!.canCreate({ config: true })).toBeDefined();
          });
        });
      });

      describe("run", () => {
        // API keys can create runs
        describe.each(apiKeyTypes)("for %s", (type) => {
          it("should succeed", async () => {
            mockApiSecret.isApiSecret.mockReturnValue(true);
            mockApiSecret.verifyApiKey.mockResolvedValue({
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
      mockJwt.verify.mockResolvedValue({
        userId: "cluster_1",
        orgId: "org_1",
        orgRole: "org:member",
      });

      const result = await extractAuthState("");
      expect(result).toMatchObject({
        entityId: "cluster_1",
        organizationId: "org_1",
        organizationRole: "org:member",
        canAccess: expect.any(Function),
        canManage: expect.any(Function),
        isAdmin: expect.any(Function),
      });
    });

    it("should allow access to owned cluster only", async () => {
      const owner = await createOwner();

      mockJwt.verify.mockResolvedValue({
        userId: owner.userId,
        orgId: owner.organizationId,
        orgRole: "org:member",
      });

      const result = await extractAuthState("");
      expect(result).toMatchObject({
        entityId: owner.userId,
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
      let run1: Run;
      let run2: Run;
      const organizationId = Math.random().toString();

      beforeAll(async () => {
        owner1 = await createOwner({ organizationId });
        owner2 = await createOwner({ organizationId });

        mockJwt.verify.mockResolvedValueOnce({
          userId: owner1.userId,
          orgId: owner1.organizationId,
          orgRole: "org:member",
        });

        owner1AuthState = await extractAuthState("");
        expect(owner1AuthState).toMatchObject({
          entityId: owner1.userId,
          organizationId: owner1.organizationId,
          organizationRole: "org:member",
          canAccess: expect.any(Function),
          canManage: expect.any(Function),
          isAdmin: expect.any(Function),
        });

        mockJwt.verify.mockResolvedValueOnce({
          userId: owner2.userId,
          orgId: owner2.organizationId,
          orgRole: "org:member",
        });

        owner2AuthState = await extractAuthState("");
        expect(owner2AuthState).toMatchObject({
          entityId: owner2.userId,
          organizationId: owner2.organizationId,
          organizationRole: "org:member",
          canAccess: expect.any(Function),
          canManage: expect.any(Function),
          isAdmin: expect.any(Function),
        });

        run1 = await createRunWithMessage({
          user: owner1AuthState! as ClerkAuth,
          clusterId: owner1.clusterId,
          message: "hello",
          type: "human",
        });

        run2 = await createRunWithMessage({
          user: owner2AuthState! as ClerkAuth,
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

          mockJwt.verify.mockResolvedValueOnce({
            userId: admin.userId,
            orgId: admin.organizationId,
            orgRole: "org:admin",
          });

          const ownerAuthState = await extractAuthState("");
          expect(ownerAuthState).toMatchObject({
            entityId: admin.userId,
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

          mockJwt.verify.mockResolvedValueOnce({
            userId: admin.userId,
            orgId: admin.organizationId,
            orgRole: "org:admin",
          });

          const ownerAuthState = await extractAuthState("");
          expect(ownerAuthState).toMatchObject({
            entityId: admin.userId,
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

describe("extractCustomerAuthState", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;
  beforeEach(async () => {
    owner = await createOwner();
    jest.resetAllMocks();
  });

  it("should extract ApiKeyAuth from valid API secret", async () => {
    mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
      someAuthValue: "someValue",
    });

    const result = await extractCustomerAuthState("abc123", owner.clusterId);

    expect(result).toMatchObject({
      type: "customer-provided",
      organizationId: owner.organizationId,
      clusterId: owner.clusterId,
      canAccess: expect.any(Function),
      token: "abc123",
      context: {
        someAuthValue: "someValue",
      },
    });

    expect(mockCustomer.verifyCustomerProvidedAuth).toHaveBeenCalledWith({
      clusterId: owner.clusterId,
      token: "abc123",
    });
  });

  describe("isUser", () => {
    it("should throw", async () => {
      mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
        someAuthValue: "someValue",
      });

      const result = await extractCustomerAuthState("abc123", owner.clusterId);

      expect(() => result!.isClerk()).toThrow();
    });
  });

  describe("canAccess", () => {
    describe("cluster", () => {
      it("should succeed for same cluster", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );
        await expect(
          result!.canAccess({ cluster: { clusterId: owner.clusterId } }),
        ).resolves.toBeDefined();
      });

      it("should throw for different cluster", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );
        await expect(
          result!.canAccess({ cluster: { clusterId: "some_other_cluster" } }),
        ).rejects.toThrow();
      });
    });

    describe("run", () => {
      // Customer Provided auth can access runs
      it("should succeed if run is customer authenticated", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const run = await createRun({
          clusterId: owner.clusterId,
          customerAuthToken: "abc123",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );
        await expect(
          result!.canAccess({
            run: {
              clusterId: owner.clusterId,
              runId: run.id,
            },
          }),
        ).resolves.toBeDefined();
      });

      it("should throw if customer authenticated token doesn't match", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const run = await createRun({
          clusterId: owner.clusterId,
          customerAuthToken: "abc123",
        });

        const result = await extractCustomerAuthState(
          "def456",
          owner.clusterId,
        );
        await expect(
          result!.canAccess({
            run: {
              clusterId: owner.clusterId,
              runId: run.id,
            },
          }),
        ).rejects.toThrow();
      });

      it("should throw if run is not customer authenticated", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const run = await createRun({
          clusterId: owner.clusterId,
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );
        await expect(
          result!.canAccess({
            run: {
              clusterId: owner.clusterId,
              runId: run.id,
            },
          }),
        ).rejects.toThrow();
      });
    });
  });

  describe("canManage", () => {
    // Customer Provided auth can manage run
    describe("run", () => {
      it("should succeed if run is customer authenticated", async () => {
        const run = await createRun({
          clusterId: owner.clusterId,
          customerAuthToken: "abc123",
        });

        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );

        await expect(
          result!.canManage({
            run: {
              clusterId: owner.clusterId,
              runId: run.id,
            },
          }),
        ).resolves.toBeDefined();
      });

      it("should throw if customer authenticated token doesn't match", async () => {
        const run = await createRun({
          clusterId: owner.clusterId,
          customerAuthToken: "abc123",
        });

        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "def456",
          owner.clusterId,
        );

        await expect(
          result!.canManage({
            run: {
              clusterId: owner.clusterId,
              runId: run.id,
            },
          }),
        ).rejects.toThrow();
      });
      it("should throw if run is not customer authenticated", async () => {
        const run = await createRun({
          clusterId: owner.clusterId,
        });

        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );

        await expect(
          result!.canManage({
            run: {
              clusterId: owner.clusterId,
              runId: run.id,
            },
          }),
        ).rejects.toThrow();
      });
    });
    describe("cluster", () => {
      // Customer Provided auth can not manage cluster
      it("should throw", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );
        await expect(
          result!.canManage({ cluster: { clusterId: owner.clusterId } }),
        ).rejects.toThrow();
      });
    });

    describe("template", () => {
      // Customer Provided auth can not manage templates
      it("should throw", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );

        await expect(
          result!.canManage({
            config: { clusterId: "cluster_1", configId: "template_1" },
          }),
        ).rejects.toThrow();
      });
    });
  });

  describe("canCreate", () => {
    // Customer provided auth cannot create clusters
    describe("cluster", () => {
      it("should throw", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );
        expect(() => result!.canCreate({ cluster: true })).toThrow();
      });
    });

    describe("template", () => {
      // Customer provided auth cannot create templates
      it("should throw", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );
        expect(() => result!.canCreate({ config: true })).toThrow();
      });
    });

    describe("run", () => {
      // Customer provided auth can create runs
      it("should succeed", async () => {
        mockCustomer.verifyCustomerProvidedAuth.mockResolvedValue({
          someAuthValue: "someValue",
        });

        const result = await extractCustomerAuthState(
          "abc123",
          owner.clusterId,
        );
        expect(() => result!.canCreate({ run: true })).toBeDefined();
      });
    });
  });
});
