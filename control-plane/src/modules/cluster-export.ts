import { z } from "zod";
import { BadRequestError } from "../utilities/errors";
import { getClusterDetails } from "./cluster";
import { editClusterDetails } from "./management";
import { versionedTexts } from "./versioned-text";
import { upsertAgent, listAgents } from "./agents";

const clusterExportSchema = z.object({
  cluster: z.object({
    name: z.string(),
    description: z.string(),
    additionalContext: versionedTexts.nullable(),
    agents: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        initialPrompt: z.string().nullable(),
        systemPrompt: z.string().nullable(),
        attachedFunctions: z.array(z.string()),
        resultSchema: z.any(),
      }),
    ),
  }),
});

export const produceClusterExport = async ({
  clusterId,
}: {
  clusterId: string;
  expiry?: number;
}) => {
  const clusterMeta = await getClusterDetails(clusterId);

  const agents = await listAgents({
    clusterId,
  });

  const output: z.infer<typeof clusterExportSchema> = {
    cluster: {
      name: clusterMeta.name,
      description: `${clusterMeta.description} (exported from ${clusterMeta.id})`,
      additionalContext: clusterMeta.additional_context,
      agents: agents.map((template) => ({
        id: template.id,
        name: template.name,
        initialPrompt: template.initialPrompt,
        systemPrompt: template.systemPrompt,
        attachedFunctions: template.attachedFunctions,
        resultSchema: template.resultSchema,
      })),
    },
  };

  return output;
};

export const consumeClusterExport = async ({
  rawData,
  clusterId,
  organizationId,
}: {
  rawData: string;
  clusterId: string;
  organizationId: string;
}) => {
  const exportData = clusterExportSchema.safeParse(JSON.parse(rawData));

  if (!exportData.success) {
    throw new BadRequestError(
      `Invalid export data: ${exportData.error.message}`,
    );
  }

  await editClusterDetails({
    name: exportData.data.cluster.name,
    description: exportData.data.cluster.description,
    additionalContext: exportData.data.cluster.additionalContext ?? undefined,
    organizationId,
    clusterId,
  });

  for (const template of exportData.data.cluster.agents) {
    await upsertAgent({
      id: template.id,
      clusterId,
      name: template.name,
      initialPrompt: template.initialPrompt,
      attachedFunctions: template.attachedFunctions,
      resultSchema: template.resultSchema,
    });
  }
};
