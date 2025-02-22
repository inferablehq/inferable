import { z } from "zod";

type SendToZapierParams = {
  data: Record<string, unknown>;
  webhookUrl: string;
};

/**
 * Sends content to a Zapier webhook
 * @param params Parameters for sending to Zapier
 * @returns The response from Zapier webhook
 * @throws Error if the request fails
 */
export async function sendToZapier({ data, webhookUrl }: SendToZapierParams) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || "Failed to send to Zapier");
  }

  const responseData = await response.json();
  return responseData;
}
