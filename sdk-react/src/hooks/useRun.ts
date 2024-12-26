import { ClientInferRequest, ClientInferResponseBody } from "@ts-rest/core";
import { useEffect, useMemo, useState } from "react";
import { contract } from "../contract";
import { createApiClient } from "../createClient";
import { useInterval } from "./useInterval";

type AuthOptionsCluster = {
  authType: "cluster";
  apiSecret: string;
};

type AuthOptionsCustom = {
  authType: "custom";
  customAuthToken: string;
};

type AuthOptions = AuthOptionsCluster | AuthOptionsCustom;

type UseRunOptions = {
  runId?: string;
  clusterId: string;
  baseUrl?: string;
  pollInterval?: number;
  onError?: (error: Error) => void;
  apiClient?: ReturnType<typeof createApiClient>;
} & AuthOptions;

type CreateMessageInput = ClientInferRequest<(typeof contract)["createMessage"]>["body"];
type ListMessagesResponse = ClientInferResponseBody<(typeof contract)["listMessages"], 200>;
type GetRunResponse = ClientInferResponseBody<(typeof contract)["getRun"], 200>;
type ListRunsResponse = ClientInferResponseBody<(typeof contract)["listRuns"], 200>;

interface UseRunReturn {
  client: ReturnType<typeof createApiClient>;
  createMessage: (input: CreateMessageInput) => Promise<void>;
  messages: ListMessagesResponse;
  run?: GetRunResponse;
}

export function useRun(options: UseRunOptions): UseRunReturn {
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
  };
}

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
