import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, integrations } from "../data";
import { integrationSchema } from "./schema";
import { tavilyIntegration } from "./constants";
import { tavily } from "./tavily";
import { toolhouseIntegration } from "./constants";
import { toolhouse } from "./toolhouse";

const toolProviders = {
  [toolhouseIntegration]: toolhouse,
  [tavilyIntegration]: tavily,
};

export function getToolProvider(tool: string) {
  if (!toolProviders[tool as keyof typeof toolProviders]) {
    throw new Error(`Unknown tool provider integration requested: ${tool}`);
  }

  return toolProviders[tool as keyof typeof toolProviders];
}

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
        getToolProvider(key)?.onActivate?.(clusterId);
      } else if (value === null) {
        getToolProvider(key)?.onDeactivate?.(clusterId);
      }
    }),
  );
};
