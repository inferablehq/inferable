import { z } from "zod";
import { inferable } from "./inferable";
import { helpers } from "inferable/bin/workflows/workflow";
import { addTagToTicket, fetchSOPContent } from "./utils";

export const workflow = inferable.workflows.create({
  name: "ticketTagging",
  description: "Analyzes and tags Zendesk tickets based on content and SOP",
  inputSchema: z.object({
    executionId: z.string(),
    ticketId: z.string(),
    ticketText: z.string(),
  }),
});

workflow.version(1).define(async (ctx, input) => {
  console.log("Starting ticket tagging workflow", { ticketId: input.ticketId });

  const tagAnalysisSchema = z.object({
    tag: z.enum(["general", "refund", "tech-support", "billing", "feature-request"]),
  });

  const sopContent = await ctx.result("fetchSOPContent", async () => {
    return fetchSOPContent();
  });

  // This agent doesn't invoke tools. Instead, we use structured prompts and structured outputs
  // to manually call the tools within the workflow control flow.
  const tagAnalysisAgent = ctx.agent({
    type: "single-step",
    name: "tagAnalysisAgent",
    systemPrompt: helpers.structuredPrompt({
      facts: [
        "You are a ticket classification specialist",
        `This is the SOP document for the company: ${sopContent}`,
        "You need to analyze the ticket text and determine the most appropriate tag",
      ],
      goals: [
        "Analyze the ticket text and compare against SOP guidelines",
        "Choose the most appropriate tag category, and attach it to the ticket",
      ],
    }),
    resultSchema: tagAnalysisSchema,
  });

  const analysisResult = await tagAnalysisAgent.trigger({
    data: {
      ticketId: input.ticketId,
      ticketText: input.ticketText,
    },
  });

  const zendeskResponse = await ctx.result("addTagToTicket", async () => {
    return addTagToTicket({
      ticketId: input.ticketId,
      tag: analysisResult.result.tag,
    });
  });

  return {
    success: true,
    tag: analysisResult.result.tag,
    zendeskResponse,
  };
});
