// to run: tsx -r dotenv/config src/workflows/demo.ts

import { z } from "zod";
import { Inferable } from "../Inferable";
import { createServices } from "./workflow-test-services";
import { getEphemeralSetup } from "./workflow-test-utils";

(async function demo() {
  const ephemeralSetup = await getEphemeralSetup();

  const inferable = new Inferable({
    apiSecret: ephemeralSetup.apiKey,
    endpoint: ephemeralSetup.endpoint,
  });

  await createServices(inferable);

  const workflow = inferable.workflows.create({
    name: "records-workflow",
    inputSchema: z.object({
      executionId: z.string(),
      customerId: z.string(),
    }),
  });

  workflow.version(1).define(async (ctx, input) => {
    const recordsAgent = ctx.agent({
      name: "recordsAgent",
      systemPrompt: "Get list of loans for a customer",
      resultSchema: z.object({
        records: z.array(z.object({ id: z.string() })),
      }),
      input: {
        customerId: input.customerId,
      },
    });

    const records = await recordsAgent.run();

    const processedRecords = await Promise.all(
      records.result.records.map((record) => {
        const agent2 = ctx.agent({
          name: "analyzeLoan",
          systemPrompt:
            "Analyze the loan and return a summary of the asset classes and their risk profile",
          resultSchema: z.object({
            loanId: z.string(),
            summary: z
              .string()
              .describe(
                "Summary of the loan, asset classes and their risk profile",
              ),
          }),
          input: {
            loanId: record.id,
            customerId: input.customerId,
          },
        });

        return agent2.run();
      }),
    );

    const riskProfile = await ctx
      .agent({
        name: "riskAgent",
        systemPrompt:
          "You are given a list of loans and their asset classes. Summarize the risk of the customer. Use the asset class details to inform the summary.",
        resultSchema: z.object({
          summary: z.string(),
        }),
        input: {
          customerId: input.customerId,
          assetClassDetails: processedRecords,
        },
      })
      .run();

    console.log(riskProfile);
  });

  await workflow.listen();

  await inferable.workflows.run("records-workflow", {
    executionId: "executionId-123",
    customerId: "customerId-123",
  });
})();
