import { z } from "zod";
import { env } from "../../../../utilities/env";
import { logger } from "../../../observability/logger";
import { AgentTool } from "../tool";

export const GET_URL_TOOL_NAME = "getUrl";

export const getUrlTool = new AgentTool({
  name: GET_URL_TOOL_NAME,
  description: "Fetches content from a URL and returns it in markdown format.",
  schema: z.object({
    url: z
      .string()
      .url()
      .describe("The URL to fetch content from")
      .regex(/^https?:\/\//, "URL must start with http:// or https://"),
  }),
  func: async (input: { url: string }) => {
    if (!env.FIRECRAWL_API_KEY) {
      throw new Error("Crawling API is not configured");
    }

    try {
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: input.url }),
      });

      if (!response.ok) {
        logger.info("Failed to fetch URL content", {
          url: input.url,
          response: response,
          apiKey: env.FIRECRAWL_API_KEY.slice(0, 4) + "...",
        });
        throw new Error(`HTTP error! status: ${JSON.stringify(response)}`);
      }

      const data = await response.json();
      return JSON.stringify({
        result: {
          success: data.success,
          markdown: data.data.markdown,
          metadata: data.data.metadata,
        },
        resultType: "resolution",
        status: "success",
      });
    } catch (error) {
      logger.error("Failed to fetch URL content", {
        url: input.url,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return JSON.stringify({
        result: {
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch URL content",
        },
        resultType: "resolution",
        status: "error",
      });
    }
  },
});
