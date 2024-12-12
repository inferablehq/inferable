import { eq, sql } from "drizzle-orm";
import { db, integrations } from "../data";
import { z } from "zod";
import { toolhouse } from "./toolhouse";
import { tavily } from "./tavily";

const toolhouseIntegration = "toolhouse";
const langfuseIntegration = "langfuse";
const tavilyIntegration = "tavily";

export const allowedIntegrations = [
  toolhouseIntegration,
  langfuseIntegration,
  tavilyIntegration,
] as const;

export const integrationSchema = z.object({
  [toolhouseIntegration]: z
    .object({
      apiKey: z.string(),
    })
    .optional()
    .nullable(),
  [langfuseIntegration]: z
    .object({
      publicKey: z.string(),
      secretKey: z.string(),
      baseUrl: z.string(),
      sendMessagePayloads: z.boolean(),
    })
    .optional()
    .nullable(),
  [tavilyIntegration]: z
    .object({
      apiKey: z.string(),
    })
    .optional()
    .nullable(),
});

export const integrationsLibs = {
  [toolhouseIntegration]: toolhouse,
  [tavilyIntegration]: tavily,
};

export const getIntegrations = async ({
  clusterId,
}: {
  clusterId: string;
}): Promise<z.infer<typeof integrationSchema>> => {
  return db
    .select({
      toolhouse: integrations.toolhouse,
      langfuse: integrations.langfuse,
      tavily: integrations.tavily,
    })
    .from(integrations)
    .where(eq(integrations.cluster_id, clusterId))
    .then(
      ([integration]) =>
        integration ?? {
          toolhouse: null,
          langfuse: null,
          tavily: null,
        },
    );
};

export const upsertIntegrations = async ({
  clusterId,
  config,
}: {
  clusterId: string;
  config: z.infer<typeof integrationSchema>;
}) => {
  await db
    .insert(integrations)
    .values({
      cluster_id: clusterId,
      ...config,
      updated_at: sql`now()`,
      created_at: sql`now()`,
    })
    .onConflictDoUpdate({
      target: [integrations.cluster_id],
      set: {
        ...config,
        updated_at: sql`now()`,
      },
    });

  await Promise.all(
    Object.entries(config).map(([key, value]) => {
      if (value) {
        integrationsLibs[key as keyof typeof integrationsLibs]?.onActivate?.(
          clusterId,
        );
      }
    }),
  );
};
