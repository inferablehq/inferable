import { Run } from "../../";
import { createCache } from "../../../../utilities/cache";
import { getClusterDetails } from "../../../management";
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

  for (const [name, tool] of Object.entries(stdlib)) {
    tools[name] = tool.tool;
  }

  return tools;
};
