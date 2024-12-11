import { useCallback, useMemo, useState } from 'react';
import { useCounter, useInterval } from 'usehooks-ts';
import { createApiClient } from '../createClient';
import { contract } from '../contract';
import { ClientInferRequest, ClientInferResponseBody } from '@ts-rest/core';

type UseRunOptions = {
  clusterId: string;
  apiSecret?: string;
  customAuthToken?: string;
  baseUrl?: string;
  pollInterval?: number;
  onError?: (error: Error) => void;
}

type CreateMessageInput = ClientInferRequest<typeof contract['createMessage']>['body'];
type ListMessagesResponse = ClientInferResponseBody<typeof contract['listMessages'], 200>
type GetRunResponse = ClientInferResponseBody<typeof contract['getRun'], 200>

interface UseRunReturn {
  client: ReturnType<typeof createApiClient>;
  createMessage: (input: CreateMessageInput) => Promise<void>;
  messages: ListMessagesResponse;
  run?: GetRunResponse;
  start: ({
    initialPrompt,
    runId
  }: {
    initialPrompt?: string;
    runId?: string;
  }) => void;
}

export function useRun(options: UseRunOptions): UseRunReturn {
  const authType = options.customAuthToken ? 'custom' : 'cluster';
  const apiSecret = options.customAuthToken ?? options.apiSecret;

  const [client] = useState(() => createApiClient({
    apiSecret,
    authType,
    baseUrl: options.baseUrl
  }));

  const [messages, setMessages] = useState<ListMessagesResponse>([]);
  const [run, setRun] = useState<GetRunResponse>();
  const [runId, setRunId] = useState<string>();

  const hasStarted = useMemo(() => ({ current: false }), [])

  const start = useCallback(async ({
    initialPrompt,
    runId
  } : {
      initialPrompt?: string;
      runId?: string;
    }) => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    if (!client) return;

    if (
        (!runId && !initialPrompt) ||
        (!!runId && !!initialPrompt)
      ) {
      options.onError?.(new Error('`start()` must be called with either runId or initialPrompt but not both'));
      return;
    }

    if (runId) {
      setRunId(runId);
      return;
    }

    try {
      const response = await client.createRun({
        body: {
          initialPrompt: initialPrompt,
        },
        params: {
          clusterId: options.clusterId
        }
      });

      if (response.status !== 201) {
        options.onError?.(new Error(`Could not create run. Status: ${response.status} Body: ${JSON.stringify(response.body)}`));
      } else {
        setRunId(response.body.id);
      }
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [client, options, hasStarted]);

  useInterval(async () => {
    if (!runId) return;
    try {
      const [messageResponse, runResponse]  = await Promise.all([
        client.listMessages({
          params: {
            clusterId: options.clusterId,
            runId: runId
          }
        }),
        client.getRun({
          params: {
            clusterId: options.clusterId,
            runId: runId
          }
        })
      ]);

      if (messageResponse.status === 200) {
        setMessages(messageResponse.body);
      } else {
        options.onError?.(new Error(`Could not list messages. Status: ${messageResponse.status} Body: ${JSON.stringify(messageResponse.body)}`));
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
      body: input
    });

    if (response.status !== 201) {
      options.onError?.(new Error(`Could not create message. Status: ${response.status} Body: ${JSON.stringify(response.body)}`));
    }
  };

  return {
    client,
    createMessage,
    messages,
    run,
    start,
  };
}
