import { contract } from "@/client/contract";
import { ClientInferResponseBody } from "@ts-rest/core";
import React from "react";
import { AiMessage } from "./ai-message";
import { HumanMessage } from "./human-message";
import { TemplateMessage } from "./template-mesage";
import { WorkflowJob } from "@/lib/types";
import { InvocationResult } from "./InvocationResult";

export type MessageContainerProps = {
  id: string;
  createdAt: Date;
  messages: ClientInferResponseBody<typeof contract.listMessages, 200>;
  data: ClientInferResponseBody<
    typeof contract.listMessages,
    200
  >[number]["data"];
  displayableContext?: Record<string, string>;
  isEditable: boolean;
  type: ClientInferResponseBody<
    typeof contract.listMessages,
    200
  >[number]["type"];
  showMeta: boolean;
  clusterId: string;
  jobs: WorkflowJob[];
  pending?: boolean;
  runId: string;
};

const container: {
  [key: string]: (props: MessageContainerProps) => React.ReactNode;
} = {
  human: HumanMessage,
  agent: AiMessage,
  template: TemplateMessage,
  "invocation-result": InvocationResult,
  default: (data) => <p>{JSON.stringify(data)}</p>,
};

function RunEvent(
  props: Omit<MessageContainerProps, "onPreMutation"> & {
    onPreMutation: (ulid: string) => void;
  }
) {
  const Container = container[props.type] || container.default;

  return (
    <Container
      data={props.data}
      jobs={props.jobs}
      type={props.type}
      clusterId={props.clusterId}
      runId={props.runId}
      isEditable={props.isEditable}
      id={props.id}
      displayableContext={props.displayableContext}
      showMeta={props.showMeta}
      createdAt={props.createdAt}
      pending={props.pending ?? false}
      messages={props.messages}
    />
  );
}

export default RunEvent;
