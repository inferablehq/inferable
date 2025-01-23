import { initClient, tsRestFetchApi } from "@ts-rest/core";
import { contract } from "../client/contract.js";
import { DEFAULT_API_URL } from "../constants.js";


export const createClient = (token: string) => initClient(contract, {
  baseUrl: DEFAULT_API_URL,
  baseHeaders: {
    authorization: `Bearer ${token}`,
  },
  api: (args) => {
    args.headers["authorization"] = `Bearer ${token}`;

    return tsRestFetchApi(args);
  },
});
