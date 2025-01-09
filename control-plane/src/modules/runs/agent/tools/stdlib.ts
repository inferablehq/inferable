import { AgentTool } from "../tool";
import { calculatorTool } from "./calculator";
import { currentDateTimeTool } from "./date-time";
import { getUrlTool } from "./get-url";

export const stdlib: Record<string, AgentTool> = {
  [calculatorTool.metadata.name]: calculatorTool,
  [currentDateTimeTool.metadata.name]: currentDateTimeTool,
  [getUrlTool.metadata.name]: getUrlTool,
};
