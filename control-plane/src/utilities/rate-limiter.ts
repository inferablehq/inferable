import { redisClient } from "../modules/dependencies/redis";

const consumeTokens = async (
  shard: string,
  tokenCount: number,
  window: "minute" | "hour" = "minute",
  maxTokensPerWindow: number,
  currentDate: Date,
): Promise<boolean> => {
  if (!redisClient) {
    throw new Error("Rate limiter can not be used without a Redis");
  }
  const currentUnit =
    window === "minute" ? currentDate.getMinutes() : currentDate.getHours();

  const key = `rate_limit:${shard}:tokens:${window}:${currentUnit}`;

  const result = await redisClient.incrBy(key, tokenCount);

  if (result <= maxTokensPerWindow) {
    // Set expiration if it's a new key
    if (result === tokenCount) {
      await redisClient.expire(key, window === "minute" ? 60 : 3600);
    }

    return true;
  }

  return false;
};

/**
 * Rate limiter for a given entity.
 *
 * @param window - The window to rate limit by.
 * @param ceiling - The maximum number of tokens allowed per window.
 * @returns An object with an `allowed` method that returns a boolean indicating if the entity is allowed to consume the given number of tokens.
 */
export const rateLimiter = ({
  window,
  ceiling,
  date = new Date(),
}: {
  window: "minute" | "hour";
  ceiling: number;
  date?: Date;
}) => {
  return {
    allowed: (entityId: string, count: number = 0) =>
      redisClient
        ? consumeTokens(entityId, count, window, ceiling, date)
        : true,
    consume: (entityId: string, count: number = 0) =>
      redisClient
        ? consumeTokens(entityId, count, window, ceiling, date)
        : true,
  };
};
