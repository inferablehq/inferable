import { buildCalculatorTool, CALCULATOR_TOOL_NAME } from "./calculator";
import { buildCurrentDateTimeTool, CURRENT_DATE_TIME_TOOL_NAME } from "./date-time";
import { buildGetUrlTool, GET_URL_TOOL_NAME } from "./get-url";
import {
  ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME,
  buildAccessKnowledgeArtifacts,
} from "./knowledge-artifacts";

// TODO: this should be Record<string, string> after we consolidate on AgentToolV2
export const stdlib = {
  accessKnowledge: {
    id: ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME,
    name: "accessKnowledge",
    description: "Accesses knowledge from the cluster's knowledge base.",
    tool: buildAccessKnowledgeArtifacts,
  },
  calculator: {
    id: CALCULATOR_TOOL_NAME,
    name: "calculator",
    description: "Performs arithmetic calculations using a Python interpreter.",
    tool: buildCalculatorTool,
  },
  currentDateTime: {
    id: CURRENT_DATE_TIME_TOOL_NAME,
    name: "currentDateTime",
    description: "Returns the current date and time.",
    tool: buildCurrentDateTimeTool,
  },
  getUrl: {
    id: GET_URL_TOOL_NAME,
    name: "getUrl",
    description: "Fetches content from a URL and returns it in markdown format.",
    tool: buildGetUrlTool,
  },
};
