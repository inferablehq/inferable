import { ClientInferResponseBody } from "@ts-rest/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { contract } from "../contract";
import { useInferable } from "./useInferable";

export type RunTimelineMessages = ClientInferResponseBody<(typeof contract)["listMessages"], 200>;
type RunTimelineRun = ClientInferResponseBody<(typeof contract)["getRunTimeline"], 200>["run"];
type RunTimelineJobs = ClientInferResponseBody<(typeof contract)["getRunTimeline"], 200>["jobs"];
type RunTimelineBlobs = ClientInferResponseBody<(typeof contract)["getRunTimeline"], 200>["blobs"];

/**
 * Return type for the useRun hook containing all the necessary methods and data for managing a run session
 * @template T - A Zod object schema type that defines the expected result structure
 */
interface UseRunReturn<T extends z.ZodObject<any>> {
  /** Function to set the current run ID and reset the session state */
  setRunId: (runId: string) => void;
  /**
   * Function to create a new human message in the current run
   * @param input - The message text to send
   */
  createMessage: (input: string) => Promise<void>;
  /** Array of messages in the current run, including human messages, agent responses, and invocation results */
  messages: RunTimelineMessages;
  /** Current run details including status, metadata, and result if available */
  run?: RunTimelineRun;
  /**
   * Typed result of the run based on the provided schema T.
   * Only available when the run is complete and successful.
   */
  result?: z.infer<T>;
  /** Array of jobs in the current run */
  jobs: RunTimelineJobs;
  /** Array of blobs in the current run */
  blobs: RunTimelineBlobs;
  /** Function to approve or deny a job in the current run */
  submitApproval: (jobId: string, approved: boolean) => Promise<void>;
  /** Function to fetch blob data for a given blob ID */
  getBlobData: (blobId: string) => Promise<unknown>;
  /** Error object if any errors occurred during the session */
  error: Error | null;
}

/**
 * Configuration options for the useRun hook
 */
interface UseRunOptions {
  /**
   * Whether to persist the run ID in localStorage.
   * When true, the run ID will be saved and restored between page reloads.
   * @default true
   */
  persist?: boolean;
}

const STORAGE_KEY = "inferable_current_run_id";

/**
 * React hook for managing an Inferable run session with real-time updates.
 * This hook handles message polling, run status updates, and message creation.
 *
 * @template T - A Zod object schema type that defines the expected result structure
 * @param inferable - The Inferable client instance from useInferable hook
 * @param options - Configuration options for the run session
 * @returns Object containing methods and data for managing the run session
 *
 * @example
 * ```tsx
 * // Basic usage with custom authentication
 * const inferable = useInferable({
 *   clusterId: "my-cluster",
 *   authType: "custom",
 *   customAuthToken: "my-token"
 * });
 *
 * const { messages, createMessage, run, result } = useRun(inferable);
 *
 * // Create a new message
 * await createMessage("Hello, how can you help me today?");
 *
 * // Access messages
 * messages.map(msg => console.log(msg.data.message));
 *
 * @example
 * ```tsx
 * // Usage with result schema validation
 * const ResultSchema = z.object({
 *   summary: z.string(),
 *   confidence: z.number()
 * });
 *
 * const { result } = useRun<typeof ResultSchema>(inferable);
 *
 * if (result) {
 *   console.log(result.summary); // Typed as string
 *   console.log(result.confidence); // Typed as number
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Disable persistence
 * const { setRunId } = useRun(inferable, { persist: false });
 *
 * // Manually manage run ID
 * setRunId("new-run-id");
 * ```
 */
export function useRun<T extends z.ZodObject<any>>(
  inferable: ReturnType<typeof useInferable>,
  options: UseRunOptions = {}
): UseRunReturn<T> {
  const { persist = true } = options;
  const [messages, setMessages] = useState<RunTimelineMessages>([]);
  const [jobs, setJobs] = useState<RunTimelineJobs>([]);
  const [blobs, setBlobs] = useState<RunTimelineBlobs>([]);
  const [run, setRun] = useState<RunTimelineRun>();
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
      setJobs([]);
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
        const [timelineResponse] = await Promise.all([
          inferable.client.getRunTimeline({
            params: { clusterId: inferable.clusterId, runId: runId },
            query: {
              messagesAfter: lastMessageId.current ?? "0",
            },
          }),
        ]);

        if (!isMounted) return;

        if (timelineResponse.status === 200) {
          const runHasChanged = JSON.stringify(timelineResponse.body.run) !== JSON.stringify(run);

          if (runHasChanged) {
            setRun(timelineResponse.body.run);
          }

          const jobsHaveChanged = JSON.stringify(timelineResponse.body.jobs) !== JSON.stringify(jobs);
          if (jobsHaveChanged) {
            setJobs(timelineResponse.body.jobs);
          }

          const blobsHaveChanged = JSON.stringify(timelineResponse.body.blobs) !== JSON.stringify(blobs);
          if (blobsHaveChanged) {
            setBlobs(timelineResponse.body.blobs);
          }

          lastMessageId.current =
            timelineResponse.body.messages.sort((a, b) => b.id.localeCompare(a.id))[0]?.id ??
            lastMessageId.current;

          const messagesHaveChanged = JSON.stringify(timelineResponse.body.messages) !== JSON.stringify(messages);

          if (messagesHaveChanged) {
            setMessages(existing =>
              existing.concat(
                timelineResponse.body.messages.filter(
                  message =>
                    message.type === "agent" ||
                      message.type === "human" ||
                      message.type === "invocation-result"
                )
              )
            );
          }
        } else {
          setError(
            new Error(
              `Could not list messages. Status: ${timelineResponse.status} Body: ${JSON.stringify(timelineResponse.body)}`
            )
          );
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
      if (!runId) throw new Error("Can not create message without a run ID");

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

  const submitApproval = useMemo(
    () => async (jobId: string, approved: boolean) => {
      const response = await inferable.client.createJobApproval({
        body: { approved },
        params: { clusterId: inferable.clusterId, jobId },
      });

      if (response.status !== 204) {
        setError(
          new Error(
            `Could not submit approval. Status: ${response.status} Body: ${JSON.stringify(response.body)}`
          )
        );
      }
    },
    [inferable.client]
  );

  const getBlobData = useMemo(
    () => async (blobId: string) => {
      const response = await inferable.client.getBlobData({
        params: { clusterId: inferable.clusterId, blobId },
      });

      if (response.status === 200) {
        return response.body;
      } else {
        setError(
          new Error(
            `Could not get blob data. Status: ${response.status} Body: ${JSON.stringify(response.body)}`
          )
        );
      }
    },
    [inferable.client]
  );

  return {
    createMessage,
    messages,
    jobs,
    blobs,
    run,
    result: run?.result ? run.result : undefined,
    error,
    setRunId: setRunIdWithPersistence,
    submitApproval,
    getBlobData,
  };
}
