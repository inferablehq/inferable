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
      facts: [
        "You are a loan records processor",
        {
          description: "Customer ID to process",
          data: input.customerId,
        },
      ],
      goals: [
        "Retrieve all loans associated with the customer",
        "Return a complete list of loan records with their IDs",
      ],
      resultSchema: z.object({
        records: z.array(z.object({ id: z.string() })),
      }),
      input: {
        customerId: input.customerId,
      },
    });

    const records = await recordsAgent.run();

    const processedRecords = await Promise.all(
      (records.result as { records: { id: string }[] }).records.map(
        (record) => {
          const agent2 = ctx.agent({
            name: "analyzeLoan",
            facts: [
              "You are a loan risk analyst",
              {
                description: "Loan ID to analyze",
                data: record.id,
              },
              {
                description: "Customer ID",
                data: input.customerId,
              },
            ],
            goals: [
              "Analyze the loan's asset classes",
              "Determine the risk profile for each asset class",
              "Provide a comprehensive summary of findings",
            ],
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
        },
      ),
    );

    const riskProfile = await ctx
      .agent({
        name: "riskAgent",
        facts: [
          "You are a senior risk assessment specialist",
          {
            description: "Customer ID to evaluate",
            data: input.customerId,
          },
          {
            description: "Detailed loan analysis results",
            data: processedRecords,
          },
        ],
        goals: [
          "Review all loan analyses and their asset classes",
          "Evaluate the overall customer risk profile",
          "Provide a comprehensive risk summary considering all assets",
        ],
        resultSchema: z.object({
          summary: z.string(),
        }),
        input: {
          customerId: input.customerId,
          assetClassDetails: processedRecords,
        },
      })
      .run();

    // this is a side-effect, albeit a useful one
    console.log(riskProfile);
  });

  await workflow.listen();

  await inferable.workflows.run("records-workflow", {
    executionId: "executionId-123",
    customerId: "customerId-123",
  });
})();
