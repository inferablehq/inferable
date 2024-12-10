import {
  AppendMessage,
  ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { useRun } from "@inferable/react";
import { agentDataSchema, genericMessageDataSchema, resultDataSchema } from "@inferable/react/dist/contract";

/**
 * Options for configuring runtime execution.
 */
type RuntimeOptions = {
  clusterId: string;

  /**
   * The API secret to use for authentication.
   */
  apiSecret: string;

  /**
   * The authentication mode to use.
   * @default "cluster"
   * @see http://docs.inferable.ai/pages/auth
   */
  authType?: "customer" | "cluster";

  /**
   * Optional, provided if you want to resume an existing run.
   */
  runId?: string;

  /**
   * Callback invoked when an error occurs during execution.
   * @param error - The error that occurred.
   */
  onError?: (error: Error) => void;
};

export function useInferableRuntime({
  clusterId,
  apiSecret,
  authType,
  runId,
  onError
}: RuntimeOptions) {

  const { messages, run, createMessage, start } = useRun({
    clusterId,
    apiSecret,
    authType,
    onError,
  });

  if (!run && !!runId) {
    start({
      runId
    });
  }

  const onNew = async (message: AppendMessage) => {
    if (message.content[0]?.type !== "text")
      throw new Error("Only text messages are supported");

    const input = message.content[0].text;

    if (!run) {
      start({
        initialPrompt: input
      });
    } else {
      await createMessage({
        message: input,
        type: "human",
      });
    }
  };

  const isRunning = run?.status ? ["running", "pending"].includes(run.status) : false;

  return {
    runtime: useExternalStoreRuntime({
      isRunning,
      messages,
      convertMessage,
      onNew,
    }),
    run,
  }

}

const convertMessage = (message: any): ThreadMessageLike => {
  switch (message.type) {
    case "human": {
      const parsedData = genericMessageDataSchema.parse(message.data);
      return {
        id: message.id,
        role: "user",
        content: [{
          type: "text",
          text: parsedData.message
        }]
      }
    }
    case "agent": {
      const parsedData = agentDataSchema.parse(message.data);
      const content = [];


      if (parsedData.message) {
        content.push({
          type: "text" as const,
          text: parsedData.message
        });
      }

      return {
        id: message.id,
        role: "assistant",
        content: content
      }
    }
    case "invocation-result": {
      const parsedData = resultDataSchema.parse(message.data);

      // TODO: Search chat history for the corresponding invocation mesasge (With args)

      return {
        id: message.id,
        role: "assistant",
        content: [{
          type: "tool-call",
          toolName: "inferable",
          args: {},
          toolCallId: parsedData.id,
          result: parsedData.result,
        }]
      }

    }

  }

  return {
    id: message.id,
    role: "system",
    content: [{
      type: "text",
      text: ""
    }],
  };
}
