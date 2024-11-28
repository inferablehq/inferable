import { and, eq, sql } from "drizzle-orm";
import * as data from "./data";
import { logger } from "./observability/logger";
import { withThrottle } from "./util";

export async function upsertMachine({
  clusterId,
  machineId,
  sdkVersion,
  sdkLanguage,
  xForwardedFor,
  ip,
}: {
  clusterId: string;
  machineId?: string;
  sdkVersion?: string;
  sdkLanguage?: string;
  xForwardedFor?: string;
  ip?: string;
}) {
  if (xForwardedFor && xForwardedFor.split(",").length > 0) {
    const hops = xForwardedFor.split(",").map((ip) => ip.trim());

    if (hops.length > 0 && hops[0]) {
      ip = hops[0];
    }
  }

  ip = ip || "";

  if (!machineId) {
    logger.error('Could not store machine info, missing "x-machine-id"', {
      machineId,
      sdkVersion,
      sdkLanguage,
      ip,
    });

    return;
  }

  // As we call this on each ping / poll, limit the number of updates that reach the database
  return withThrottle(
    `clusters:${clusterId}:machines:${machineId}:throttle`,
    60,
    async () =>
      await data.db
        .insert(data.machines)
        .values({
          id: machineId,
          last_ping_at: sql`now()`,
          ip,
          sdk_version: sdkVersion,
          sdk_language: sdkLanguage,
          cluster_id: clusterId,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [data.machines.id, data.machines.cluster_id],
          set: {
            last_ping_at: sql`excluded.last_ping_at`,
            ip: sql`excluded.ip`,
            status: sql`excluded.status`,
          },
          where: and(
            eq(data.machines.cluster_id, clusterId),
            eq(data.machines.id, machineId),
          ),
        }),
  );
}
