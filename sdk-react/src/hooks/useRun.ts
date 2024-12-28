import { ClientInferRequest, ClientInferResponseBody } from "@ts-rest/core";
import { useEffect, useMemo, useState } from "react";
import { contract } from "../contract";
import { createApiClient } from "../createClient";
import { useInterval } from "./useInterval";
import { z } from "zod";

/** Authentication options for using cluster-based authentication */
type AuthOptionsCluster = {
  authType: "cluster";
  /** API secret key for cluster authentication */
  apiSecret: string;
};

/** Authentication options for using custom authentication */
type AuthOptionsCustom = {
  authType: "custom";
  /** Custom authentication token */
  customAuthToken: string;
};

/** Combined authentication options type */
type AuthOptions = AuthOptionsCluster | AuthOptionsCustom;

/** Configuration options for the useRun hook */
type UseRunOptions<T extends z.ZodObject<any>> = {
  /** Optional existing run ID. If not provided, a new run will be created */
  runId?: string;
  /** ID of the cluster to connect to */
  clusterId: string;
  /** Optional base URL for the API. Defaults to production URL if not specified */
  baseUrl?: string;
  /** Polling interval in milliseconds. Defaults to 1000ms */
  pollInterval?: number;
  /** Optional error callback function */
  onError?: (error: Error) => void;
  /** Optional pre-configured API client instance */
  apiClient?: ReturnType<typeof createApiClient>;
  /** Optional result schema for the run */
  resultSchema?: T;
} & AuthOptions;

type CreateMessageInput = ClientInferRequest<(typeof contract)["createMessage"]>["body"];
type ListMessagesResponse = ClientInferResponseBody<(typeof contract)["listMessages"], 200>;
type GetRunResponse = ClientInferResponseBody<(typeof contract)["getRun"], 200>;
type ListRunsResponse = ClientInferResponseBody<(typeof contract)["listRuns"], 200>;

/** Return type for the useRun hook */
interface UseRunReturn<T extends z.ZodObject<any>> {
  /** Configured API client instance */
  client: ReturnType<typeof createApiClient>;
  /** Function to create a new message in the current run */
  createMessage: (input: CreateMessageInput) => Promise<void>;
  /** Array of messages in the current run */
  messages: ListMessagesResponse;
  /** Current run details if available */
  run?: GetRunResponse;
  /** Result of the run if available */
  result?: z.infer<T>;
}

/**
 * React hook for managing a run session with real-time updates
 * @param options Configuration options for the run session
 * @returns Object containing the client, message creation function, messages array, and run details
 * @example
 * ```tsx
 * const { messages, createMessage, run } = useRun({
 *   clusterId: "my-cluster",
 *   authType: "custom",
 *   customAuthToken: "my-custom-auth-token"
 * });
 * ```
 */
export function useRun<T extends z.ZodObject<any>>(options: UseRunOptions<T>): UseRunReturn<T> {
  const client = useMemo(() => {
    return (
      options.apiClient ??
      createApiClient({
        authHeader:
          options.authType === "custom"
            ? `custom ${options.customAuthToken}`
            : `bearer ${options.apiSecret}`,
        baseUrl: options.baseUrl,
      })
    );
  }, [
    options.baseUrl,
    options.authType,
    options.authType === "custom" ? options.customAuthToken : options.apiSecret,
  ]);

  const [messages, setMessages] = useState<ListMessagesResponse>([]);
  const [run, setRun] = useState<GetRunResponse>();
  const [runId, setRunId] = useState<string>();

  useEffect(() => {
    if (!client) {
      return;
    }

    if (options.runId) {
      setRunId(options.runId);
    } else {
      client
        .createRun({
          body: {
            runId,
            resultSchema: options.resultSchema as any,
          },
          params: {
            clusterId: options.clusterId,
          },
        })
        .then(response => {
          if (response.status !== 201) {
            options.onError?.(
              new Error(
                `Could not create run. Status: ${response.status} Body: ${JSON.stringify(response.body)}`
              )
            );
          } else {
            setRunId(response.body.id);
          }
        })
        .catch(error => {
          options.onError?.(error instanceof Error ? error : new Error(String(error)));
        });
    }
  }, [client]);

  useInterval(async () => {
    if (!runId) {
      return;
    }

    try {
      const [messageResponse, runResponse] = await Promise.all([
        client.listMessages({
          params: {
            clusterId: options.clusterId,
            runId: runId,
          },
        }),
        client.getRun({
          params: {
            clusterId: options.clusterId,
            runId: runId,
          },
        }),
      ]);

      if (messageResponse.status === 200) {
        setMessages(messageResponse.body);
      } else {
        options.onError?.(
          new Error(
            `Could not list messages. Status: ${messageResponse.status} Body: ${JSON.stringify(messageResponse.body)}`
          )
        );
      }

      if (runResponse.status === 200) {
        setRun(runResponse.body);
      } else {
        options.onError?.(new Error(`Could not get run. Status: ${runResponse.status}`));
      }
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, options.pollInterval || 1000);

  const createMessage = async (input: CreateMessageInput) => {
    if (!runId) return;

    const response = await client.createMessage({
      params: {
        clusterId: options.clusterId,
        runId,
      },
      body: input,
    });

    if (response.status !== 201) {
      options.onError?.(
        new Error(
          `Could not create message. Status: ${response.status} Body: ${JSON.stringify(response.body)}`
        )
      );
    }
  };

  return {
    client,
    createMessage,
    messages,
    run,
    result: run?.result ? options.resultSchema?.safeParse(run.result)?.data : undefined,
  };
}

/**
 * React hook for listing and monitoring runs in a cluster
 * @param options Configuration options for listing runs
 * @returns Object containing the array of runs
 * @example
 * ```tsx
 * const { runs } = useRuns({
 *   clusterId: "my-cluster",
 *   authType: "custom",
 *   customAuthToken: "my-custom-auth-token"
 * });
 * ```
 */
export function useRuns(
  options: {
    clusterId: string;
    baseUrl?: string;
    pollInterval?: number;
    onError?: (error: Error) => void;
    apiClient?: ReturnType<typeof createApiClient>;
  } & AuthOptions
) {
  const [runs, setRuns] = useState<ListRunsResponse>([]);

  const client = useMemo(() => {
    return (
      options.apiClient ??
      createApiClient({
        baseUrl: options.baseUrl,
        authHeader:
          options.authType === "custom"
            ? `custom ${options.customAuthToken}`
            : `bearer ${options.apiSecret}`,
      })
    );
  }, [
    options.baseUrl,
    options.authType,
    options.authType === "custom" ? options.customAuthToken : options.apiSecret,
  ]);

  useInterval(async () => {
    const response = await client.listRuns({
      params: {
        clusterId: options.clusterId,
      },
    });

    if (response.status === 200) {
      setRuns(response.body);
    } else {
      options.onError?.(new Error(`Could not list runs. Status: ${response.status}`));
    }
  }, options.pollInterval || 2000);

  return {
    runs,
  };
}
