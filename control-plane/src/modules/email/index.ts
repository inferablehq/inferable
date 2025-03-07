import { z } from "zod";
import { env } from "../../utilities/env";
import { notificationSchema } from "../contract";
import { ses } from "../dependencies/ses";

export const sendEmail = async (
  notification: z.infer<typeof notificationSchema>,
  subject?: string,
) => {
  if (!env.SES_EMAIL_IDENTITY) {
    throw new Error(
      `Inferable control-plane does not have an SES email identity configured`,
    );
  }

  if (notification.destination?.type !== "email") return;

  return await ses.sendEmail({
    Destination: { ToAddresses: [notification.destination.email] },
    Source: `no-reply@${env.SES_EMAIL_IDENTITY}`,
    Message: {
      Subject: { Charset: "UTF-8", Data: subject || "" },
      Body: { Text: { Charset: "UTF-8", Data: notification.message || "" } },
    },
  });
};

export const notifyApprovalRequest = async ({
  jobId,
  clusterId,
  targetFn,
  notification,
}: {
  jobId: string;
  clusterId: string;
  targetFn: string;
  notification?: z.infer<typeof notificationSchema>;
}) => {
  if (!notification) return;

  const components = targetFn.split("_").slice(1);
  components.pop();
  const name = components.join("_");

  const workflowUrl = `${env.APP_ORIGIN}/clusters/${clusterId}/workflows/${name}/executions/${jobId}`;
  let message = `Workflow ${name} has requested approval for execution ${jobId}.

${workflowUrl}`;

  if (notification.message) {
    message += `\n\n${notification.message}`;
  }

  return await sendEmail(
    { ...notification, message },
    `Approval Request: ${name}`,
  );
};
