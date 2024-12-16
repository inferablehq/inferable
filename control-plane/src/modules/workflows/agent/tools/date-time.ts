import { z } from "zod";
import { AgentTool } from "../tool";

export const CURRENT_DATE_TIME_TOOL_NAME = "currentDateTime";

export const buildCurrentDateTimeTool = (): AgentTool =>
  new AgentTool({
    name: CURRENT_DATE_TIME_TOOL_NAME,
    description: "Retrieves the current date and time in ISO 8601 format and unix timestamp.",
    schema: z.object({}),
    func: async () => {
      return JSON.stringify({
        iso8601: new Date().toISOString(),
        unix: new Date().getTime()
      })
    },
  });
