import { rateLimiter } from "./rate-limiter";
import { redisClient } from "../modules/dependencies/redis";

describe("rateLimiter", () => {
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

  it("should allow requests within the rate limit", async () => {
    const baseDate = new Date("2023-01-01T00:00:00Z");
    const limiter = rateLimiter({
      window: "minute",
      ceiling: 5,
      date: baseDate,
    });
    const entityId = "test-user-1";

    for (let i = 0; i < 5; i++) {
      const result = await limiter.allowed(entityId, 1);
      expect(result).toBe(true);
    }

    const result = await limiter.allowed(entityId, 1);
    expect(result).toBe(false);
  });

  it("should reset the rate limit after the window expires", async () => {
    const baseDate = new Date("2023-01-01T00:00:00Z");
    const entityId = "test-user-2";

    const limiter1 = rateLimiter({
      window: "minute",
      ceiling: 3,
      date: baseDate,
    });

    for (let i = 0; i < 3; i++) {
      await limiter1.consume(entityId, 1);
    }

    let result = await limiter1.allowed(entityId, 1);
    expect(result).toBe(false);

    // Simulate time passing to the next minute
    const nextMinute = new Date(baseDate.getTime() + 60000);
    const limiter2 = rateLimiter({
      window: "minute",
      ceiling: 3,
      date: nextMinute,
    });

    result = await limiter2.allowed(entityId, 1);
    expect(result).toBe(true);
  });

  it("should handle multiple entities separately", async () => {
    const baseDate = new Date("2023-01-01T00:00:00Z");
    const limiter = rateLimiter({
      window: "hour",
      ceiling: 10,
      date: baseDate,
    });
    const entityId1 = "test-user-3";
    const entityId2 = "test-user-4";

    for (let i = 0; i < 10; i++) {
      await limiter.consume(entityId1, 1);
    }

    let result = await limiter.allowed(entityId1, 1);
    expect(result).toBe(false);

    result = await limiter.allowed(entityId2, 1);
    expect(result).toBe(true);
  });

  it("should handle consuming multiple tokens at once", async () => {
    const baseDate = new Date("2023-01-01T00:00:00Z");
    const limiter = rateLimiter({
      window: "minute",
      ceiling: 10,
      date: baseDate,
    });
    const entityId = "test-user-5";

    let result = await limiter.consume(entityId, 7);
    expect(result).toBe(true);

    result = await limiter.consume(entityId, 3);
    expect(result).toBe(true);

    result = await limiter.consume(entityId, 1);
    expect(result).toBe(false);
  });

  it("should handle rate limiting across hour boundaries", async () => {
    const baseDate = new Date("2023-01-01T23:59:00Z");
    const entityId = "test-user-6";

    const limiter1 = rateLimiter({
      window: "hour",
      ceiling: 5,
      date: baseDate,
    });

    for (let i = 0; i < 5; i++) {
      await limiter1.consume(entityId, 1);
    }

    let result = await limiter1.allowed(entityId, 1);
    expect(result).toBe(false);

    // Simulate time passing to the next hour
    const nextHour = new Date("2023-01-02T00:00:00Z");
    const limiter2 = rateLimiter({
      window: "hour",
      ceiling: 5,
      date: nextHour,
    });

    result = await limiter2.allowed(entityId, 1);
    expect(result).toBe(true);
  });
});
