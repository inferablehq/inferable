import { Run } from "../../";
import {
  buildAccessKnowledgeArtifacts,
  ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME,
} from "./knowledge-artifacts";
import { createCache } from "../../../../utilities/cache";
import { getClusterDetails } from "../../../management";
import { buildCurrentDateTimeTool, CURRENT_DATE_TIME_TOOL_NAME } from "./date-time";
import { AgentTool, AgentToolV2 } from "../tool";
import { stdlib } from "./stdlib";

const clusterSettingsCache = createCache<{
  enableKnowledgebase: boolean;
}>(Symbol("clusterSettings"));

export type InternalToolBuilder = (
  run: Run,
  toolCallId: string
) => AgentTool | Promise<AgentTool> | AgentToolV2; // TODO: Standardize on AgentToolV2

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

  for (const [name, tool] of Object.entries(stdlib).filter(
    tool => tool[0] !== ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME
  )) {
    tools[name] = tool.tool;
  }

  return tools;
};
