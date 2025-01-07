import { buildCalculatorTool } from "./calculator";
import { buildCurrentDateTimeTool } from "./date-time";
import { buildGetUrlTool } from "./get-url";

// TODO: this should be Record<string, string> after we consolidate on AgentToolV2
export const stdlib = {
  calculator: {
    name: "calculator",
    description: "Performs arithmetic calculations using a Python interpreter.",
    tool: buildCalculatorTool,
  },
  currentDateTime: {
    name: "currentDateTime",
    description: "Returns the current date and time.",
    tool: buildCurrentDateTimeTool,
  },
  getUrl: {
    name: "getUrl",
    description: "Fetches content from a URL and returns it in markdown format.",
    tool: buildGetUrlTool,
  },
};
