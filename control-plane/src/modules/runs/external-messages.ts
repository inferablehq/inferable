import { and, eq } from "drizzle-orm";
import { db, externalMessages } from "../data";

export const createExternalMessage = async ({
  clusterId,
  runId,
  messageId,
  externalId,
  channel,
}: {
  clusterId: string;
  runId: string;
  messageId: string;
  externalId: string;
  channel: "slack" | "email";
}) => {
  return db.insert(externalMessages).values({
    cluster_id: clusterId,
    run_id: runId,
    message_id: messageId,
    external_id: externalId,
    channel,
  });
};

export const getExternalMessage = async ({
  clusterId,
  externalId,
}: {
  clusterId: string;
  externalId: string;
}) => {
  const [result] = await db
    .select({
      runId: externalMessages.run_id,
      messageId: externalMessages.message_id,
    })
    .from(externalMessages)
    .where(
      and(
        eq(externalMessages.external_id, externalId),
        eq(externalMessages.cluster_id, clusterId),
      ),
    );

  return result;
};
