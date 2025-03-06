import { z } from "zod";
import { env } from "../../utilities/env";
import { notificationSchema } from "../contract";
import { ses } from "../dependencies/ses";

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
  if (notification?.destination?.type !== "email") {
    return;
  }

  if (!env.SES_EMAIL_IDENTITY) {
    throw new Error(
      `Inferable control-plane does not have an SES email identity configured`,
    );
  }

  const components = targetFn.split("_").slice(1);
  components.pop();
  const name = components.join("_");

  const workflowUrl = `${env.APP_ORIGIN}/clusters/${clusterId}/workflows/${name}/executions/${jobId}`;

  let message = `Workflow ${name} has requested approval for execution ${jobId}.\n\n${workflowUrl}`;

  if (notification?.message) {
    message += `\n\n${notification.message}`;
  }

  return await ses.sendEmail({
    Destination: {
      ToAddresses: [notification.destination.email],
    },
    Source: `no-reply@${env.SES_EMAIL_IDENTITY}`,
    Message: {
      Subject: {
        Charset: "UTF-8",
        Data: "Approval Requested",
      },
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: message,
        },
      },
    },
  });
};
