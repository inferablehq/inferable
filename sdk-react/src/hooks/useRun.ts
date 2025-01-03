import { ClientInferRequest, ClientInferResponseBody } from "@ts-rest/core";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { z } from "zod";
import { contract } from "../contract";
import { useInferable } from "./useInferable";

export type ListMessagesResponse = ClientInferResponseBody<(typeof contract)["listMessages"], 200>;
type GetRunResponse = ClientInferResponseBody<(typeof contract)["getRun"], 200>;

/** Return type for the useRun hook */
interface UseRunReturn<T extends z.ZodObject<any>> {
  /** Set the run ID */
  setRunId: (runId: string) => void;
  /** Function to create a new message in the current run */
  createMessage: (input: string) => Promise<void>;
  /** Array of messages in the current run */
  messages: ListMessagesResponse;
  /** Current run details if available */
  run?: GetRunResponse;
  /** Result of the run if available */
  result?: z.infer<T>;
  /** Error if any occurred */
  error: Error | null;
}

interface UseRunOptions {
  /** Whether to persist the run ID in localStorage. Defaults to true. */
  persist?: boolean;
}

const STORAGE_KEY = "inferable_current_run_id";

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
export function useRun<T extends z.ZodObject<any>>(
  inferable: ReturnType<typeof useInferable>,
  options: UseRunOptions = {}
): UseRunReturn<T> {
  const { persist = true } = options;
  const [messages, setMessages] = useState<ListMessagesResponse>([]);
  const [run, setRun] = useState<GetRunResponse>();
  const [runId, setRunId] = useState<string | undefined>(() => {
    if (persist && typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || undefined;
    }
    return undefined;
  });
  const [error, setError] = useState<Error | null>(null);

  const setRunIdWithPersistence = useCallback(
    (newRunId: string) => {
      if (persist && typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, newRunId);
      }
      setRunId(newRunId);
      setMessages([]);
      setRun(undefined);
      lastMessageId.current = null;
    },
    [persist]
  );

  const lastMessageId = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const pollMessages = async () => {
      if (!isMounted) return;
      if (!runId) return;

      try {
        const [messageResponse, runResponse] = await Promise.all([
          inferable.client.listMessages({
            params: { clusterId: inferable.clusterId, runId: runId },
            query: {
              after: lastMessageId.current ?? "0",
            },
          }),
          inferable.client.getRun({
            params: { clusterId: inferable.clusterId, runId: runId },
          }),
        ]);

        if (!isMounted) return;

        if (messageResponse.status === 200) {
          lastMessageId.current =
            messageResponse.body.sort((a, b) => b.id.localeCompare(a.id))[0]?.id ??
            lastMessageId.current;

          setMessages(existing =>
            existing.concat(
              messageResponse.body.filter(
                message =>
                  message.type === "agent" ||
                  message.type === "human" ||
                  message.type === "invocation-result"
              )
            )
          );
        } else {
          setError(
            new Error(
              `Could not list messages. Status: ${messageResponse.status} Body: ${JSON.stringify(messageResponse.body)}`
            )
          );
        }

        if (runResponse.status === 200) {
          const runHasChanged = JSON.stringify(runResponse.body) !== JSON.stringify(run);

          if (runHasChanged) {
            setRun(runResponse.body);
          }
        } else {
          setError(new Error(`Could not get run. Status: ${runResponse.status}`));
        }

        // Schedule next poll
        timeoutId = setTimeout(pollMessages, 1000);
      } catch (error) {
        setError(error instanceof Error ? error : new Error(String(error)));
        // Even on error, continue polling
        timeoutId = setTimeout(pollMessages, 1000);
      }
    };

    // Start polling
    pollMessages();

    // Cleanup function
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [inferable.client, run, runId]);

  const createMessage = useMemo(
    () => async (input: string) => {
      if (!runId) return;

      const response = await inferable.client.createMessage({
        params: { clusterId: inferable.clusterId, runId: runId },
        body: {
          message: input,
          type: "human",
        },
      });

      if (response.status !== 201) {
        setError(
          new Error(
            `Could not create message. Status: ${response.status} Body: ${JSON.stringify(response.body)}`
          )
        );
      }
    },
    [inferable.client, runId]
  );

  return {
    createMessage,
    messages,
    run,
    result: run?.result ? run.result : undefined,
    error,
    setRunId: setRunIdWithPersistence,
  };
}
