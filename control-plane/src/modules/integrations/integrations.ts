import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, integrations } from "../data";
import { slackIntegration } from "./constants";
import { slack } from "./slack";
import { InstallableIntegration } from "./types";
import { integrationSchema } from "../contract";

const installables: Record<string, InstallableIntegration> = {
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
      langfuse: integrations.langfuse,
      slack: integrations.slack,
    })
    .from(integrations)
    .where(eq(integrations.cluster_id, clusterId))
    .then(
      ([integration]) =>
        integration ?? {
          langfuse: null,
          slack: null,
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
          return getInstallables(key)?.onActivate?.(
            clusterId,
            config,
            existing,
          );
        } else if (value === null) {
          return getInstallables(key)?.onDeactivate?.(
            clusterId,
            config,
            existing,
          );
        }
      }),
  );
};
