import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, integrations } from "../data";
import { integrationSchema } from "./schema";
import { tavilyIntegration, valtownIntegration, toolhouseIntegration, slackIntegration } from "./constants";
import { tavily } from "./tavily";
import { toolhouse } from "./toolhouse";
import { valtown } from "./valtown";
import { slack } from "./slack";
import { InstallableIntegration } from "./types";

const installables: Record<string, InstallableIntegration> = {
  [toolhouseIntegration]: toolhouse,
  [tavilyIntegration]: tavily,
  [valtownIntegration]: valtown,
  [slackIntegration]: slack,
};

export function getInstallables(tool: string) {
  if (!installables[tool as keyof typeof installables]) {
    throw new Error(`Unknown tool provider integration requested: ${tool}`);
  }

  return installables[tool as keyof typeof installables];
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
      slack: integrations.slack,
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
          slack: null,
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
  const existing = await getIntegrations({ clusterId });

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
    Object.entries(config)
      .filter(([key]) => installables[key as keyof typeof installables])
      .map(([key, value]) => {
      if (value) {
        return getInstallables(key)?.onActivate?.(clusterId, config, existing);
      } else if (value === null) {
        return getInstallables(key)?.onDeactivate?.(clusterId, config, existing);
      }
    })
  );
};
