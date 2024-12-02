import { DynamicStructuredTool } from "@langchain/core/tools";
import { Run } from "../../workflows";
import {
  buildAccessKnowledgeArtifacts,
  ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME,
} from "./knowledge-artifacts";
import { createCache } from "../../../../utilities/cache";
import { getClusterDetails } from "../../../management";
import {
  buildCurrentDateTimeTool,
  CURRENT_DATE_TIME_TOOL_NAME,
} from "./date-time";

const clusterSettingsCache = createCache<{
  enableKnowledgebase: boolean;
}>(Symbol("clusterSettings"));

const CACHE_TTL = 60 * 2; // 2 minutes

export type InternalToolBuilder = (
  workflow: Run,
  toolCallId: string
) => DynamicStructuredTool | Promise<DynamicStructuredTool>;

export const getClusterInternalTools = async (
  clusterId: string
): Promise<Record<string, InternalToolBuilder>> => {
  const cacheKey = `cluster:${clusterId}`;

  let settings = await clusterSettingsCache.get(cacheKey);

  if (!settings) {
    // Get cluster settings
    const cluster = await getClusterDetails({ clusterId });
    settings = {
      enableKnowledgebase: cluster.enableKnowledgebase,
    };
    await clusterSettingsCache.set(cacheKey, settings, CACHE_TTL);
  }

  const tools: Record<string, InternalToolBuilder> = {};

  // Only include knowledge artifacts tool if enabled for cluster
  if (settings.enableKnowledgebase) {
    tools[ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME] = buildAccessKnowledgeArtifacts;
  }

  tools[CURRENT_DATE_TIME_TOOL_NAME] = buildCurrentDateTimeTool;

  return tools;
};
