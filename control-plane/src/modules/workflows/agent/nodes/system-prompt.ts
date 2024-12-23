import { WorkflowAgentState } from "../state";
import { AgentTool } from "../tool";

export const getSystemPrompt = (
  state: WorkflowAgentState,
  tools: AgentTool[],
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

  if (state.workflow.enableResultGrounding) {
    basePrompt.push(
      "When referring to facts, reference the json path of the fact as a markdown link [value](jsonpath). JSON paths must start with the ULID.",
    );
    basePrompt.push("For example, [John](ULID.result.users[0].name)");
  }

  if (state.workflow.resultSchema) {
    basePrompt.push(
      "Once all tasks have been completed, return the final result as a structured json object in the requested format",
    );
  } else {
    basePrompt.push(
      "Once all tasks have been completed, return the final result in markdown with your message.",
    );
  }

  // Add additional context if present
  if (state.additionalContext) {
    basePrompt.push(state.additionalContext);
  }


  // Add tool schemas
  basePrompt.push("<TOOLS_SCHEMAS>");
  basePrompt.push(...tools.map(tool => {
    return `${tool.name} - ${tool.description} ${tool.schema}`;
  }));
  basePrompt.push("</TOOLS_SCHEMAS>");

  // Add other available tools
  basePrompt.push("<OTHER_AVAILABLE_TOOLS>");
  basePrompt.push(
    ...state.allAvailableTools.filter(
      (t) => !tools.find((s) => s.name === t),
    ),
  );
  basePrompt.push("</OTHER_AVAILABLE_TOOLS>");

  return basePrompt.map((p) => p.trim()).join("\n");
};
