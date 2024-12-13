import { createHash } from "crypto";
import NodeCache from "node-cache";
import { redisClient } from "../modules/redis";

const localCache = new NodeCache({
  maxKeys: 5000,
});

export const createCache = <T>(namespace: symbol) => {
  return {
    get: async (key: string) => {
      const localResult = localCache.get<T>(`${namespace.toString()}:${key}`);
      if (localResult !== undefined) {
        return localResult;
      }

      const redisResult = await redisClient?.get(`${namespace.toString()}:${key}`);
      if (redisResult) {
        return JSON.parse(redisResult) as T;
      }
      return undefined;
    },
    set: async (key: string, value: T, ttl: number) => {
      await redisClient?.set(
        `${namespace.toString()}:${key}`,
        JSON.stringify(value),
        {
          EX: ttl
        }

      )
      return localCache.set(`${namespace.toString()}:${key}`, value, ttl);
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

