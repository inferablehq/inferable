import { env } from "../../utilities/env";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { Anthropic } from "@anthropic-ai/sdk";
import { logger } from "../observability/logger";
import { BedrockCohereEmbeddings } from "../embeddings/bedrock-cohere-embeddings";
import { CohereEmbeddings } from "@langchain/cohere";

export const CONTEXT_WINDOW: Record<string, number> = {
  "claude-3-5-sonnet": 200_000,
  "claude-3-haiku": 200_000,
};

const routingOptions = {
  "claude-3-5-sonnet": [
    ...(env.BEDROCK_AVAILABLE
      ? [
          {
            buildClient: () => buildBedrockAnthropicClient("us-west-2"),
            modelId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
            beta: false,
          },
          {
            buildClient: () => buildBedrockAnthropicClient("us-east-1"),
            modelId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
            beta: false,
          },
          {
            buildClient: () => buildBedrockAnthropicClient("eu-central-1"),
            // 20240620 not yet available
            modelId: "eu.anthropic.claude-3-5-sonnet-20240620-v1:0",
            beta: false,
          },
          {
            buildClient: () => buildBedrockAnthropicClient("ap-northeast-1"),
            // 20240620 not yet available
            modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
            beta: false,
          },
          {
            buildClient: () => buildBedrockAnthropicClient("ap-northeast-2"),
            // 20240620 not yet available
            modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
            beta: false,
          },
        ]
      : []),

    ...(env.ANTHROPIC_API_KEY
      ? [
          {
            buildClient: () => buildAnthropicClient(),
            modelId: "claude-3-5-sonnet-20241022",
            beta: false,
          },
        ]
      : []),
  ],
  "claude-3-haiku": [
    ...(env.BEDROCK_AVAILABLE
      ? [
          {
            buildClient: () => buildBedrockAnthropicClient("us-east-1"),
            modelId: "us.anthropic.claude-3-haiku-20240307-v1:0",
            beta: false,
          },
          {
            buildClient: () => buildBedrockAnthropicClient("eu-central-1"),
            modelId: "eu.anthropic.claude-3-haiku-20240307-v1:0",
            beta: false,
          },
          {
            buildClient: () => buildBedrockAnthropicClient("ap-northeast-1"),
            modelId: "anthropic.claude-3-haiku-20240307-v1:0",
            beta: false,
          },
          {
            buildClient: () => buildBedrockAnthropicClient("ap-northeast-2"),
            modelId: "anthropic.claude-3-haiku-20240307-v1:0",
            beta: false,
          },
        ]
      : []),
    ...(env.ANTHROPIC_API_KEY
      ? [
          {
            buildClient: () => buildAnthropicClient(),
            modelId: "claude-3-haiku-20240307",
            beta: false,
          },
        ]
      : []),
  ],
};

const embeddingOptions = {
  "embed-english-v3": [
    ...(env.BEDROCK_AVAILABLE
      ? [
          {
            buildClient: () => buildBedrockCohereClient("us-west-2"),
            modelId: "cohere.embed-english-v3",
            beta: false,
          },
        ]
      : []),
    ...(env.COHERE_API_KEY
      ? [
          {
            buildClient: () => buildCohereClient(),
            modelId: "embed-english-v3.0",
            beta: false,
          },
        ]
      : []),
  ],
};

export type ChatIdentifiers = keyof typeof routingOptions;
export const isChatIdentifier = (
  identifier: string,
): identifier is ChatIdentifiers => {
  return identifier in routingOptions;
};
export type EmbeddingIdentifiers = keyof typeof embeddingOptions;
export const isEmbeddingIdentifier = (
  identifier: string,
): identifier is EmbeddingIdentifiers => {
  return identifier in embeddingOptions;
};

export const getRouting = ({
  identifier,
  index,
}: {
  identifier: ChatIdentifiers;
  index: number;
}) => {
  if (index >= routingOptions[identifier].length) {
    logger.warn("Routing index out of bounds", {
      identifier,
      index,
    });
    index = index % routingOptions[identifier].length;
  }

  const routing = routingOptions[identifier][index];

  return routing;
};

export const getEmbeddingRouting = ({
  identifier,
  index,
}: {
  identifier: EmbeddingIdentifiers;
  index: number;
}) => {
  if (index >= embeddingOptions[identifier].length) {
    logger.warn("Routing index out of bounds", {
      identifier,
      index,
    });
    index = index % embeddingOptions[identifier].length;
  }

  const routing = embeddingOptions[identifier][index];

  return routing;
};

const buildBedrockAnthropicClient = (region: string) => {
  if (!env.BEDROCK_AVAILABLE) {
    throw new Error("BEDROCK_AVAILABLE not set");
  }

  return new AnthropicBedrock({
    awsRegion: region,
  });
};

const buildAnthropicClient = () => {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });
};

const buildBedrockCohereClient = (region: string) => {
  return new BedrockCohereEmbeddings({
    model: "cohere.embed-english-v3",
    region: region,
  });
};

const buildCohereClient = () => {
  if (!env.COHERE_API_KEY) {
    throw new Error("Missing COHERE_API_KEY");
  }

  return new CohereEmbeddings({
    model: "embed-english-v3.0",
  });
};

export const start = () => {
  for (const [key, value] of Object.entries(routingOptions)) {
    if (value.length === 0) {
      throw new Error(`No provider available for ${key}`);
    }
  }

  for (const [key, value] of Object.entries(embeddingOptions)) {
    if (value.length === 0) {
      throw new Error(`No provider available for ${key}`);
    }
  }
};
