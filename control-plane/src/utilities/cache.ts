import { createHash } from "crypto";
import NodeCache from "node-cache";
import { redisClient } from "../modules/dependencies/redis";
import { logger } from "../modules/observability/logger";

export const createCache = <T>(namespace: symbol) => {
  const localCache = new NodeCache({
    maxKeys: 5000,
  });

  return {
    get: async (key: string) => {
      const localResult = localCache.get<T>(key);

      if (localResult !== undefined) {
        return localResult;
      }

      const redisResult = await redisClient
        ?.get(`${namespace.toString()}:${key}`)
        .catch(() => undefined);
      if (redisResult) {
        return JSON.parse(redisResult) as T;
      }
      return undefined;
    },
    set: async (key: string, value: T, stdTTLSeconds: number) => {
      localCache.set(key, value, stdTTLSeconds);

      if (stdTTLSeconds > 1000) {
        logger.warn("Cache set with TTL greater than 1000 seconds", {
          key,
          stdTTLSeconds,
        });
      }

      await redisClient
        ?.set(`${namespace.toString()}:${key}`, JSON.stringify(value), {
          EX: stdTTLSeconds,
        })
        .catch(error => {
          logger.error("Error setting cache", {
            error,
            key,
            value,
          });
        });
    },
  };
};

// Usage
// const cache = createCache(Symbol("cache"));
// cache.set("key", "value");
// const value = cache.get("key");

export const hashFromSecret = (secret: string): string => {
  return createHash("sha256").update(secret).digest("hex");
};
