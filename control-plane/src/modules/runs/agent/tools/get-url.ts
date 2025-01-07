import { z } from "zod";
import { AgentToolV2 } from "../tool";
import { logger } from "../../../observability/logger";
import { env } from "../../../../utilities/env";

export const GET_URL_TOOL_NAME = "get_url";

export const buildGetUrlTool = (): AgentToolV2 =>
  new AgentToolV2({
    name: GET_URL_TOOL_NAME,
    description: "Fetches content from a URL and returns it in markdown format.",
    schema: z.object({
      url: z.string().url().describe("The URL to fetch content from"),
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
          body: JSON.stringify({ url: input.url, scrapeOptions: ["markdown"] }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return {
          success: data.success,
          markdown: data.data.markdown,
          metadata: data.data.metadata,
        };
      } catch (error) {
        logger.error("Failed to fetch URL content", {
          url: input.url,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch URL content",
        };
      }
    },
  });
