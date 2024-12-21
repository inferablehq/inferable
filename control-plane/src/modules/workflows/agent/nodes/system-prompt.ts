import { WorkflowAgentState } from "../state";

export const getSystemPrompt = (
  state: WorkflowAgentState,
  schemaString: string[],
): string => {
  const basePrompt = [
    "You are a helpful assistant with access to a set of tools designed to assist in completing tasks.",
    "You do not respond to greetings or small talk, and instead, you return 'done'.",
    "Use the tools at your disposal to achieve the task requested.",
    "If you cannot complete a task with the given tools, return 'done' and explain the issue clearly.",
    "If there is nothing left to do, return 'done' and provide the final result.",
    "If you encounter invocation errors (e.g., incorrect tool name, missing input), retry based on the error message.",
    "When possible, return multiple invocations to trigger them in parallel.",
  ];

  // Add the result line based on conditions
  if (state.workflow.resultSchema) {
    basePrompt.push(
      "Once all tasks have been completed, return the final result as a structured object in the requested format",
    );
  } else if (state.workflow.enableResultGrounding) {
    basePrompt.push(
      "When referring to tool results, reference json object path as {{id}}. DO NOT REFERENCE THE ORIGINAL VALUES.",
    );
  } else {
    basePrompt.push(
      "Once all tasks have been completed, return the final result in markdown",
    );
  }

  // Add additional context if present
  if (state.additionalContext) {
    basePrompt.push(state.additionalContext);
  }

  // Add tool schemas
  basePrompt.push("<TOOLS_SCHEMAS>");
  basePrompt.push(...schemaString);
  basePrompt.push("</TOOLS_SCHEMAS>");

  // Add other available tools
  basePrompt.push("<OTHER_AVAILABLE_TOOLS>");
  basePrompt.push(
    ...state.allAvailableTools.filter(
      (t) => !schemaString.find((s) => s.includes(t)),
    ),
  );
  basePrompt.push("</OTHER_AVAILABLE_TOOLS>");

  return basePrompt.join(" ");
};
