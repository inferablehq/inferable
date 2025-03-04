import {
  contract,
  MessageTypes,
  UnifiedMessage,
  UnifiedMessageOfType,
} from "@/client/contract";
import { ClientInferResponseBody } from "@ts-rest/core";
import React from "react";
import { AiMessage } from "./ai-message";
import { HumanMessage } from "./human-message";
import { TemplateMessage } from "./template-mesage";
import { RunJob } from "@/lib/types";
import { InvocationResult } from "./InvocationResult";

export type MessageContainerProps<T extends MessageTypes> =
  UnifiedMessageOfType<T> & {
    messages: ClientInferResponseBody<typeof contract.listMessages, 200>;
    jobs: RunJob[];
    clusterId: string;
    runId: string;
    showMeta: boolean;
    pending?: boolean;
  };

function RunEvent(props: MessageContainerProps<MessageTypes>) {
  switch (props.type) {
    case "agent":
      return <AiMessage {...props} />;
    case "human":
      return <HumanMessage {...props} />;
    case "template":
      return <TemplateMessage {...props} />;
    case "invocation-result":
      return <InvocationResult {...props} />;
    case "supervisor":
      return null;
    case "agent-invalid":
      return null;
    default:
      return null;
  }
}

export default RunEvent;
