import { ListMessagesResponse } from "./useRun";

export const useMessages = (messages?: ListMessagesResponse) => {
  return {
    all: (sort: "asc" | "desc" = "desc") =>
      messages?.sort((a, b) =>
        sort === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)
      ),
    getOfType: (
      type: "invocation-result" | "invocation-request" | "invocation-response" | "invocation-error"
    ) => messages?.filter(message => message.type === type),
    getLastOfType: (
      type: "invocation-result" | "invocation-request" | "invocation-response" | "invocation-error"
    ) =>
      messages
        ?.filter(message => message.type === type)
        .sort((a, b) => b.id.localeCompare(a.id))[0],
  };
};
