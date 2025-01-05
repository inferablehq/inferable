import { Run } from "../../";
import {
  buildAccessKnowledgeArtifacts,
  ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME,
} from "./knowledge-artifacts";
import { createCache } from "../../../../utilities/cache";
import { getClusterDetails } from "../../../management";
import { buildCurrentDateTimeTool, CURRENT_DATE_TIME_TOOL_NAME } from "./date-time";
import { AgentTool } from "../tool";

const clusterSettingsCache = createCache<{
  enableKnowledgebase: boolean;
}>(Symbol("clusterSettings"));

export type InternalToolBuilder = (
  run: Run,
  toolCallId: string
) => AgentTool | Promise<AgentTool>;

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
    await clusterSettingsCache.set(cacheKey, settings, 60 * 2);
  }

  const tools: Record<string, InternalToolBuilder> = {};

  // Only include knowledge artifacts tool if enabled for cluster
  if (settings.enableKnowledgebase) {
    tools[ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME] = buildAccessKnowledgeArtifacts;
  }

  tools[CURRENT_DATE_TIME_TOOL_NAME] = buildCurrentDateTimeTool;

  return tools;
};
