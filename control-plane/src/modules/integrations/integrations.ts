import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, integrations } from "../data";
import { integrationSchema } from "./schema";
import { tavilyIntegration, valtownIntegration, toolhouseIntegration } from "./constants";
import { tavily } from "./tavily";
import { toolhouse } from "./toolhouse";
import { valtown } from "./valtown";
import { ToolProvider } from "./types";

const toolProviders: Record<string, ToolProvider> = {
  [toolhouseIntegration]: toolhouse,
  [tavilyIntegration]: tavily,
  [valtownIntegration]: valtown,
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
      valtown: integrations.valtown,
    })
    .from(integrations)
    .where(eq(integrations.cluster_id, clusterId))
    .then(
      ([integration]) =>
        integration ?? {
          toolhouse: null,
          langfuse: null,
          tavily: null,
          valtown: null,
        }
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
        return getToolProvider(key)?.onActivate?.(clusterId, config);
      } else if (value === null) {
        return getToolProvider(key)?.onDeactivate?.(clusterId, config);
      }
    })
  );
};
