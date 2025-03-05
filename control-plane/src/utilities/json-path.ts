import jsonpath from "jsonpath";
import { NotFoundError } from "./errors";
import { redisClient } from "../modules/dependencies/redis";

export const extractWithJsonPath = (path: string, args: unknown) => {
  const result = jsonpath.query(args, path);
  if (!result || result.length === 0) {
    throw new NotFoundError(`Path ${path} not found within input`);
  }
  return result;
};
