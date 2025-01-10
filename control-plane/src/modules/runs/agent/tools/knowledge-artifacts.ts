import { z } from "zod";
import { logger } from "../../../observability/logger";
import { getKnowledge } from "../../../knowledge/knowledgebase";
import * as events from "../../../observability/events";
import { getAllUniqueTags } from "../../../embeddings/embeddings";
import { AgentTool } from "../tool";

export const ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME = "accessKnowledgeArtifacts";

export const buildAccessKnowledgeArtifacts = async (run: any): Promise<AgentTool> => {
  const tags = await getAllUniqueTags(run.clusterId, "knowledgebase-artifact");

  return new AgentTool({
    name: ACCESS_KNOWLEDGE_ARTIFACTS_TOOL_NAME,
    description: "Retrieves relevant knowledge artifacts based on a given query.",
    schema: z.object({
      query: z.string().describe("The query to search for knowledge artifacts"),
      tag:
        tags.length > 0
          ? z
              .enum(tags as [string, ...string[]])
              .describe(
                "The tag to filter the knowledge artifacts by. If not provided, all artifacts are returned."
              )
              .optional()
          : z.undefined().optional(),
    }),
    func: async (input: { query: string; tag?: string }) => {
      logger.info("Accessing knowledge artifacts", input);

      try {
        const artifacts = await getKnowledge({
          clusterId: run.clusterId,
          query: input.query,
          tag: input.tag,
        });

        events.write({
          type: "knowledgeArtifactsAccessed",
          clusterId: run.clusterId,
          workflowId: run.id,
          meta: {
            artifacts: artifacts.map(
              artifact =>
                `# ${artifact.title} (${Math.round(artifact.similarity * 100)}%) \n ${artifact.data} \n\n`
            ),
          },
        });

        return JSON.stringify({
          result: artifacts,
          resultType: "resolution",
          status: "success",
        });
      } catch (e) {
        logger.error("Error accessing knowledge artifacts", {
          error: e,
        });

        return JSON.stringify({
          result: "Internal error, please try again.",
          resultType: "rejection",
          status: "error",
        });
      }
    },
  });
};
