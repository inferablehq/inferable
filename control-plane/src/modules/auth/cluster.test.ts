import { redisClient } from "../redis";
import { createOwner } from "../test/util";
import * as clusterAuth from "./cluster";

describe("verify", () => {
  beforeAll(async () => {
    // Ensure Redis client is connected
    await redisClient?.connect();
  });

  afterAll(async () => {
    // Close Redis connection after all tests
    await redisClient?.quit();
  });

  beforeEach(async () => {
    // Clear all keys in Redis before each test
    await redisClient?.flushAll();
  });

  it("should verify an api secret when the key exists", async () => {
    const owner = await createOwner();
    const key = await clusterAuth.createApiKey({
      clusterId: owner.clusterId,
      createdBy: owner.userId,
      name: "test key",
    });

    const result = await clusterAuth.verify(key.key);

    expect(result).toEqual({
      organizationId: owner.organizationId,
      clusterId: owner.clusterId,
      id: key.id,
    });
  });

  it("should return null when the key does not exist", async () => {
    const result = await clusterAuth.verify("invalid-token");
    expect(result).toBeUndefined();
  });

  it("should return null when the key is revoked", async () => {
    const owner = await createOwner();

    const key = await clusterAuth.createApiKey({
      clusterId: owner.clusterId,
      createdBy: owner.userId,
      name: "test key",
    });

    await clusterAuth.revokeApiKey({
      clusterId: owner.clusterId,
      keyId: key.id,
    });

    const result = await clusterAuth.verify(key.key);

    expect(result).toBeUndefined();
  });
});
