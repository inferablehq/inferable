import Anthropic from "@anthropic-ai/sdk";
import { Toolhouse } from "@toolhouseai/sdk";
import assert from "assert";
import { isNotNull } from "drizzle-orm";
import { z } from "zod";
import { integrationSchema } from "../contract";
import * as cron from "../cron";
import * as data from "../data";
import { acknowledgeJob, getJob, persistJobResult } from "../jobs/jobs";
import { logger } from "../observability/logger";
import { packer } from "../packer";
import { upsertServiceDefinition } from "../service-definitions";
import { InstallableIntegration } from "./types";

const ToolHouseResultSchema = z.array(
  z.object({
    content: z.array(
      z.object({
        content: z.string().optional(),
      })
    ),
  })
);

export const start = () =>
  cron.registerCron(syncToolHouse, "sync-toolhouse", {
    interval: 1000 * 60 * 5,
  }); // every 5 minutes

export const validateConfig = async (config: z.infer<typeof integrationSchema>) => {
  if (!config.toolhouse?.apiKey) {
    throw new Error("ToolHouse API key is required");
  }

  const toolhouse = new Toolhouse({
    apiKey: config.toolhouse.apiKey,
    provider: "anthropic",
  });

  await toolhouse.getTools();
};

const handleCall = async (
  call: NonNullable<Awaited<ReturnType<typeof getJob>>>,
  integrations: z.infer<typeof integrationSchema>
) => {
  await acknowledgeJob({
    jobId: call.id,
    clusterId: call.clusterId,
    machineId: "TOOLHOUSE",
  });

  assert(integrations.toolhouse?.apiKey, "Missing ToolHouse API key");

  try {
    const result = await invokeToolHouse({
      input: packer.unpack(call.targetArgs),
      toolName: call.targetFn,
      apiKey: integrations.toolhouse.apiKey,
      callId: call.id,
      metadata: {
        ...(call.authContext instanceof Object ? call.authContext : {}),
        ...(call.runContext instanceof Object ? call.runContext : {}),
      },
    });

    await persistJobResult({
      result: packer.pack(result),
      resultType: "resolution",
      jobId: call.id,
      owner: {
        clusterId: call.clusterId,
      },
      machineId: "TOOLHOUSE",
    });
  } catch (error) {
    await persistJobResult({
      result: packer.pack(error),
      resultType: "rejection",
      jobId: call.id,
      owner: {
        clusterId: call.clusterId,
      },
      machineId: "TOOLHOUSE",
    });
  }
};

const invokeToolHouse = async ({
  input,
  toolName,
  apiKey,
  callId,
  metadata,
}: {
  input: string;
  toolName: string;
  apiKey: string;
  callId: string;
  metadata?: Record<string, unknown>;
}) => {
  const toolhouse = new Toolhouse({
    apiKey,
    provider: "anthropic",
    metadata: {
      timezone: "0",
      ...metadata,
    },
  });

  const result = await toolhouse.runTools({
    content: [
      {
        id: callId,
        input,
        name: toToolHouseName(toolName),
        type: "tool_use",
      },
    ],
    type: "message",
    role: "assistant",
    stop_reason: "tool_use",
    stop_sequence: null,
    id: null as any,
    model: null as any,
    usage: null as any,
  });

  const parsedResult = ToolHouseResultSchema.safeParse(result);
  if (
    !parsedResult.success ||
    parsedResult.data.length !== 2 ||
    parsedResult.data[1].content.length !== 1
  ) {
    throw new Error("Received unexpected result from ToolHouse");
  }

  return parsedResult.data[1].content[0].content;
};

const syncToolHouseService = async ({
  clusterId,
  apiKey,
}: {
  clusterId: string;
  apiKey?: string;
}) => {
  logger.info("Syncing ToolHouse", { clusterId });

  if (!apiKey) {
    logger.warn("No ToolHouse API key found for integration", { clusterId });
    return;
  }
  const toolhouse = new Toolhouse({
    apiKey,
    provider: "anthropic",
  });

  const tools = (await toolhouse.getTools()) as Anthropic.Messages.Tool[];

  await upsertServiceDefinition({
    service: "ToolHouse",
    definition: {
      name: "ToolHouse",
      functions: tools.map(tool => {
        return {
          name: toInferableName(tool.name),
          description: tool.description,
          schema: JSON.stringify(tool.input_schema),
        };
      }),
    },
    owner: { clusterId },
  });
};

const syncToolHouse = async () => {
  const toolHouseClusters = await data.db
    .select({
      clusterId: data.integrations.cluster_id,
      config: data.integrations.toolhouse,
    })
    .from(data.integrations)
    .where(isNotNull(data.integrations.toolhouse));

  logger.info("Syncing ToolHouse", {
    count: toolHouseClusters.length,
  });

  await Promise.all(
    // TODO: We will need to shard this
    toolHouseClusters.map(async integration => {
      try {
        await syncToolHouseService({
          clusterId: integration.clusterId,
          apiKey: integration.config?.apiKey,
        });
      } catch (error) {
        logger.info("Failed to sync Toolhouse", {
          clusterId: integration.clusterId,
          error,
        });
      }
    })
  );
};

// Convert snake_case to camelCase
const toInferableName = (input: string) => {
  const transformed = input
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return transformed.charAt(0).toLowerCase() + transformed.slice(1);
};

// Convert camelCase to snake_case
const toToolHouseName = (input: string) => {
  return input.replace(/([A-Z])/g, "_$1").toLowerCase();
};

export const toolhouse: InstallableIntegration = {
  name: "ToolHouse",
  onActivate: async (clusterId: string, config: z.infer<typeof integrationSchema>) => {
    return syncToolHouseService({
      clusterId,
      apiKey: config.toolhouse?.apiKey,
    });
  },
  onDeactivate: async (clusterId: string, config: z.infer<typeof integrationSchema>) => {
    // TODO: (good-first-issue) Delete the service definition
  },
  handleCall,
};
