import { env } from "../../../../utilities/env";
import { AgentTool } from "../tool";
import { calculatorTool } from "./calculator";
import { currentDateTimeTool } from "./date-time";
import { getUrlTool } from "./get-url";

const stdlib: Record<string, AgentTool> = {
  [calculatorTool.metadata.name]: calculatorTool,
  [currentDateTimeTool.metadata.name]: currentDateTimeTool,
  [getUrlTool.metadata.name]: getUrlTool,
};

export const availableStdlib = () => {
  return Object.entries(stdlib)
    .filter(([name]) => {
      switch (name) {
        case calculatorTool.metadata.name:
          return !!env.E2B_ACCESS_TOKEN
        case getUrlTool.metadata.name:
          return !!env.FIRECRAWL_API_KEY;
        default:
          return true;
      }
    }).reduce((acc, [name, tool]) => {
      acc[name] = tool;
      return acc;
    }, {} as Record<string, AgentTool>);
};
