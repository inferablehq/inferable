import { z } from "zod";
import { inferableInstance } from "../utils";

const cache = new Map<string, any>();

export const getProduct = async ({
  id,
  random,
}: {
  id: string;
  random: string;
}) => {
  return {
    id,
    name: `Product ${id}`,
    random,
  };
};

export const succeedsOnSecondAttempt = async ({ id }: { id: string }) => {
  if (cache.has(id)) {
    return true;
  } else {
    cache.set(id, true);
    // wait 5s and time out
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
};

export const productService = () => {
  const prefix = `product${Math.random().toString(36).substring(2, 5)}`;
  const client = inferableInstance();

  client.tools.register({
    name: `${prefix}_getProduct10sCache`,
    func: getProduct,
    schema: {
      input: z.object({
        id: z.string(),
        random: z.string(),
      }),
    },
    config: {
      retryCountOnStall: 0,
      timeoutSeconds: 5,
      cache: {
        keyPath: "$.id",
        ttlSeconds: 10,
      },
    },
  });

  client.tools.register({
    name: `${prefix}_getProduct1sCache`,
    func: getProduct,
    schema: {
      input: z.object({
        id: z.string(),
        random: z.string(),
      }),
    },
    config: {
      retryCountOnStall: 0,
      timeoutSeconds: 5,
      cache: {
        keyPath: "$.id",
        ttlSeconds: 1,
      },
    },
  });

  let failingFunctionCount = 0;

  client.tools.register({
    name: `${prefix}_failingFunction`,
    func: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      failingFunctionCount++;
      return failingFunctionCount;
    },
    schema: {
      input: z.object({
        id: z.string(),
      }),
    },
    config: {
      retryCountOnStall: 0,
      timeoutSeconds: 2,
    },
  });

  client.tools.register({
    name: `${prefix}_succeedsOnSecondAttempt`,
    func: succeedsOnSecondAttempt,
    schema: {
      input: z.object({
        id: z.string(),
      }),
    },
    config: {
      retryCountOnStall: 2,
      timeoutSeconds: 2,
    },
  });

  return {
    prefix,
    client,
  };
};
