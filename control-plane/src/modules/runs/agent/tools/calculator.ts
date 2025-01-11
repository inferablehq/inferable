import { Sandbox } from "@e2b/code-interpreter";
import { z } from "zod";
import { env } from "../../../../utilities/env";
import { logger } from "../../../observability/logger";
import { AgentTool } from "../tool";

export const CALCULATOR_TOOL_NAME = "calculator";

export const calculatorTool = new AgentTool({
  name: CALCULATOR_TOOL_NAME,
  description: "Performs arithmetic calculations using a Python interpreter.",
  schema: z.object({
    expression: z.string().describe("The expression to evaluate. Example: 2 + 3 - 1"),
  }),
  func: async (input: { expression: string }) => {
    if (!env.E2B_ACCESS_TOKEN) {
      throw new Error("Sandbox is not configured");
    }

    const sbx = await Sandbox.create({
      apiKey: env.E2B_ACCESS_TOKEN,
      requestTimeoutMs: 5_000,
    });

    const result = await sbx.runCode(`print(${input.expression})`);

    logger.info("Calculator tool executed", {
      logs: result.logs,
      text: result.text,
    });

    return JSON.stringify({
      result: {
        error: result.error,
        results: result.results,
        text: result.text,
        logs: result.logs,
      },
      resultType: "resolution",
      status: "success",
    });
  },
});
