import jsonpath from "jsonpath";
import { NotFoundError } from "../utilities/errors";
import { redisClient } from "./redis";

export const extractWithJsonPath = (path: string, args: unknown) => {
  const result = jsonpath.query(args, path);
  if (!result || result.length === 0) {
    throw new NotFoundError(`Path ${path} not found within input`);
  }
  return result;
};

export const withThrottle = async <T>(key: string, expiry: number, fn: () => Promise<T>) => {
  if (await redisClient?.get(key)) {
    return;
  }

  const [result] = await Promise.all([
    fn(),
    redisClient?.set(key, "1", {
      EX: expiry,
    }),
  ]);

  return result;
};
