import { createClient } from "redis";
import { env } from "../../utilities/env";

export const redisClient = env.REDIS_URL
  ? createClient({
      url: env.REDIS_URL,
    })
  : undefined;

export const start = async () => {
  await redisClient?.connect();
};

export const stop = async () => {
  await redisClient?.quit();
};
