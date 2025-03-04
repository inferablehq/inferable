import { z } from "zod";
import { inferable } from "./inferable";
import { helpers } from "inferable/bin/workflows/workflow";

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

  // Create agent to analyze ticket and determine tag
  const tagAnalysisSchema = z.object({
    tag: z.enum([
      "general",
      "refund",
      "tech-support",
      "billing",
      "feature-request",
    ]),
  });

  const tagAnalysisAgent = ctx.agent({
    name: "tagAnalysisAgent",
    systemPrompt: helpers.structuredPrompt({
      facts: [
        "You are a ticket classification specialist",
        "You have access to the company SOP document",
        "You need to analyze the ticket text and determine the most appropriate tag",
      ],
      goals: [
        "Analyze the ticket text and compare against SOP guidelines",
        "Choose the most appropriate tag category, and attach it to the ticket",
      ],
    }),
    // You can specify tools to use in the agent explicitly. If you don't, all tools
    // registered in the `inferable.tools` object will be used.
    // tools: ["fetchSOPContent", "addTagToTicket"],
    resultSchema: tagAnalysisSchema,
  });

  const analysisResult = await tagAnalysisAgent.trigger({
    data: {
      ticketId: input.ticketId,
      ticketText: input.ticketText,
    },
  });

  return {
    success: true,
    tag: analysisResult.result.tag,
  };
});
