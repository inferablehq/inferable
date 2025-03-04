import { z } from "zod";
import { inferable } from "./inferable";

// Function implementations
async function fetchSOPContent(): Promise<string> {
  const response = await fetch(process.env.SOP_URL as string);
  return response.text();
}

async function addTagToTicket(input: {
  ticketId: string;
  tag: string;
}): Promise<void> {
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

// Register tools with Inferable
inferable.tools.register({
  name: "fetchSOPContent",
  func: fetchSOPContent,
  description:
    "Fetches Standard Operating Procedures content from external URL",
  schema: {
    input: z.object({}),
  },
});

inferable.tools.register({
  name: "addTagToTicket",
  func: addTagToTicket,
  description: "Adds a tag to a Zendesk ticket",
  schema: {
    input: z.object({
      ticketId: z.string().describe("The Zendesk ticket ID"),
      tag: z.string().describe("The tag to add to the ticket"),
    }),
  },
});

export const tools = inferable.tools;
