import { initClient, tsRestFetchApi } from "@ts-rest/core";
import { contract } from "./contract";

/**
 * Provides raw API access to the Inferable API.
 */
export const createApiClient = ({
  baseUrl,
  clientAbortController,
  authType,
  apiSecret,
}: {
    baseUrl?: string;
    clientAbortController?: AbortController;
    authType?: 'customer' | 'cluster';
    apiSecret?: string
  }) =>  {
  const baseHeaders = authType === 'customer' ? {
    Authorization: `customer ${apiSecret}`
  } : {
      Authorization: `bearer ${apiSecret}`
    };

  return initClient(contract, {
    baseUrl: baseUrl ?? "https://api.inferable.ai",
    baseHeaders,
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
  })
};
