import { z } from "zod";
import { getIntegrations } from "./integrations";
import { upsertServiceDefinition } from "../service-definitions";
import { logger } from "../observability/logger";

const TavilySearchParamsSchema = z.object({
  query: z.string(),
  searchDepth: z.enum(["basic", "advanced"]).optional(),
  topic: z.enum(["general", "news"]).optional(),
  days: z.number().int().positive().optional(),
  maxResults: z.number().int().positive().optional(),
  includeImages: z.boolean().optional(),
  includeImageDescriptions: z.boolean().optional(),
  includeAnswer: z.boolean().optional(),
  includeDomains: z.array(z.string()).optional(),
});

const TavilySearchResponseSchema = z.object({
  query: z.string(),
  answer: z.string().optional(),
  response_time: z.number(),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      content: z.string(),
      raw_content: z.string().optional(),
      score: z.number(),
      published_date: z.string().optional(),
    }),
  ),
});

export type TavilySearchParams = z.infer<typeof TavilySearchParamsSchema>;
export type TavilySearchResponse = z.infer<typeof TavilySearchResponseSchema>;

const tavilyApiKeyForCluster = async (clusterId: string) => {
  const integrations = await getIntegrations({ clusterId });
  return integrations.tavily?.apiKey;
};

/**
 * Perform a search using the Tavily API
 * @param params Search parameters
 * @param apiKey Tavily API key
 * @returns Search results
 * @throws Error if the request fails or response validation fails
 */
export async function searchTavily({
  params,
  apiKey,
}: {
  params: TavilySearchParams;
  apiKey: string;
}): Promise<TavilySearchResponse> {
  try {
    // Validate parameters
    TavilySearchParamsSchema.parse(params);

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: params.query,
        search_depth: params.searchDepth,
        topic: params.topic,
        days: params.days,
        max_results: params.maxResults,
        include_images: params.includeImages,
        include_image_descriptions: params.includeImageDescriptions,
        include_answer: params.includeAnswer,
        api_key: apiKey,
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || "Failed to perform search");
    }

    const rawData = await response.json();

    // Validate response data
    return TavilySearchResponseSchema.parse(rawData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        error.issues[0].path.length > 0
          ? `Invalid ${error.issues[0].path.join(".")} in ${error.issues[0].message}`
          : error.message,
      );
    }
    throw error;
  }
}

const syncTavilyService = async ({
  clusterId,
  apiKey,
}: {
  clusterId: string;
  apiKey?: string;
}) => {
  logger.info("Syncing Tavily", { clusterId });

  if (!apiKey) {
    logger.warn("No Tavily API key found for integration", { clusterId });
    return;
  }

  await upsertServiceDefinition({
    service: "Tavily",
    definition: {
      name: "Tavily",
      functions: [
        {
          name: "search",
          description:
            "Perform a web search using Tavily's AI-powered search API",
          schema: JSON.stringify({
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" },
              searchDepth: {
                type: "string",
                enum: ["basic", "advanced"],
                description:
                  "The depth of the search. 'basic' is faster, 'advanced' is more thorough",
              },
              topic: {
                type: "string",
                enum: ["general", "news"],
                description: "The type of content to search for",
              },
              days: {
                type: "number",
                description: "Number of days to look back for results",
              },
              maxResults: {
                type: "number",
                description: "Maximum number of results to return",
              },
              includeImages: {
                type: "boolean",
                description: "Whether to include images in the results",
              },
              includeAnswer: {
                type: "boolean",
                description: "Whether to include an AI-generated answer",
              },
            },
            required: ["query"],
          }),
        },
      ],
    },
    owner: { clusterId },
  });
};

export const tavily = {
  onActivate: async (clusterId: string) => {
    return syncTavilyService({
      clusterId,
      apiKey: await tavilyApiKeyForCluster(clusterId),
    });
  },
  onDeactivate: async (clusterId: string) => {
    // TODO: (good-first-issue) Delete the service definition
  },
};
