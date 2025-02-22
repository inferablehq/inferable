export async function fetchSOPContent(): Promise<string> {
  const response = await fetch(process.env.SOP_URL as string);
  return response.text();
}

export async function addTagToTicket(input: { ticketId: string; tag: string }): Promise<void> {
  await fetch(`${process.env.ZENDESK_API_URL}/tickets/${input.ticketId}/tags`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${process.env.ZENDESK_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tags: [input.tag],
    }),
  });
}
