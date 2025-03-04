import { initClient, tsRestFetchApi } from "@ts-rest/core";
import { contract } from "./contract";

/**
 * Provides raw API access to the Inferable API.
 */
export const createApiClient = ({
  baseUrl,
  clientAbortController,
  authHeader,
}: {
  baseUrl?: string;
  clientAbortController?: AbortController;
  authHeader: string;
}) => {
  return initClient(contract, {
    baseUrl: baseUrl ?? "https://api.inferable.ai",
    baseHeaders: { Authorization: authHeader },
    api: async (args) => {
      try {
        return await tsRestFetchApi({
          ...args,
          ...(clientAbortController
            ? { signal: clientAbortController.signal }
            : {}),
        });
      } catch (e) {
        return {
          status: -1,
          headers: new Headers(),
          body: e,
        };
      }
    },
  });
};
