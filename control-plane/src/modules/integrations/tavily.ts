import { z } from "zod";
import { getIntegrations } from "./integrations";
import { deleteServiceDefinition, upsertServiceDefinition } from "../service-definitions";
import { logger } from "../observability/logger";
import { acknowledgeJob, getJob, persistJobResult } from "../jobs/jobs";
import { packer } from "../packer";

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

export type TavilySearchParams = z.infer<typeof TavilySearchParamsSchema>;

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
}) {
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
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || "Failed to perform search");
  }

  const rawData = await response.json();

  return rawData;
}

const definition = {
  name: "Tavily",
  functions: [
    {
      name: "search",
      description: "Perform a web search using Tavily's AI-powered search API",
      schema: JSON.stringify({
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          searchDepth: {
            type: "string",
            enum: ["basic", "advanced"],
            description: "The depth of the search. 'basic' is faster, 'advanced' is more thorough",
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
};

const syncTavilyService = async ({ clusterId, apiKey }: { clusterId: string; apiKey?: string }) => {
  logger.info("Syncing Tavily", { clusterId });

  if (!apiKey) {
    logger.warn("No Tavily API key found for integration", { clusterId });
    return;
  }

  await upsertServiceDefinition({
    type: "permanent",
    service: "Tavily",
    definition,
    owner: { clusterId },
  });
};

const unsyncTavilyService = async ({ clusterId }: { clusterId: string }) => {
  await deleteServiceDefinition({
    service: "Tavily",
    owner: { clusterId },
  });
};

const handleCall = async ({
  call,
  clusterId,
}: {
  call: NonNullable<Awaited<ReturnType<typeof getJob>>>;
  clusterId: string;
}) => {
  await acknowledgeJob({
    jobId: call.id,
    clusterId,
    machineId: "TAVILY",
  });

  const apiKey = await tavilyApiKeyForCluster(clusterId);
  if (!apiKey) {
    logger.warn("No Tavily API key found for integration", { clusterId });
    return;
  }

  try {
    const result = await searchTavily({
      params: packer.unpack(call.targetArgs),
      apiKey,
    });

    await persistJobResult({
      result: packer.pack(result),
      resultType: "resolution",
      jobId: call.id,
      owner: {
        clusterId,
      },
      machineId: "TAVILY",
    });
  } catch (error) {
    await persistJobResult({
      result: packer.pack(error),
      resultType: "rejection",
      jobId: call.id,
      owner: {
        clusterId,
      },
      machineId: "TAVILY",
    });
  }
};

export const tavily = {
  name: "Tavily",
  onActivate: async (clusterId: string) => {
    await syncTavilyService({
      clusterId,
      apiKey: await tavilyApiKeyForCluster(clusterId),
    });
  },
  onDeactivate: async (clusterId: string) => {
    await unsyncTavilyService({ clusterId });
  },
  handleCall,
};
