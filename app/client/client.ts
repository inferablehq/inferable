import { initClient } from "@ts-rest/core";
import { contract } from "./contract";

const isServer = typeof window === "undefined";

const getBaseUrl = () => {
  if (isServer) {
    return `${process.env.NEXT_PUBLIC_INFERABLE_API_URL || "https://api.inferable.ai"}`;
  }

  return `/api`;
};

export const client = initClient(contract, {
  baseUrl: getBaseUrl(),
  baseHeaders: {},
});

export const clientWithAbortController = (signal: AbortSignal) => {
  return initClient(contract, {
    baseUrl: getBaseUrl(),
    baseHeaders: {},
    abortSignal: signal,
  });
};
