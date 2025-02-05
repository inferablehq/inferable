// to run: tsx -r dotenv/config src/workflows/demo.ts

import { z } from "zod";
import { Inferable } from "../Inferable";
import { createServices } from "./workflow-test-services";
import { getEphemeralSetup } from "./workflow-test-utils";
import { helpers } from "./workflow";

(async function demo() {
  const ephemeralSetup = process.env.INFERABLE_TEST_CLUSTER_ID
    ? {
        clusterId: process.env.INFERABLE_TEST_CLUSTER_ID,
        apiKey: process.env.INFERABLE_TEST_API_SECRET,
        endpoint: process.env.INFERABLE_TEST_API_ENDPOINT,
      }
    : await getEphemeralSetup();

  if (process.env.INFERABLE_TEST_CLUSTER_ID) {
    console.log("Using permanent setup...");
  } else {
    console.log("Using ephemeral setup...");
  }

  const inferable = new Inferable({
    apiSecret: ephemeralSetup.apiKey,
    endpoint: ephemeralSetup.endpoint,
  });

  await createServices(inferable);

  const workflow = inferable.workflows.create({
    name: "records",
    inputSchema: z.object({
      executionId: z.string(),
      customerId: z.string(),
    }),
  });

  workflow.version(1).define(async (ctx, input) => {
    const recordsAgent = ctx.agent({
      name: "recordsAgent",
      systemPrompt: helpers.structuredPrompt({
        facts: [
          "You are a loan records processor",
          `Customer ID to process: ${input.customerId}`,
        ],
        goals: [
          "Retrieve all loans associated with the customer",
          "Return a complete list of loan records with their IDs",
        ],
      }),
      resultSchema: z.object({
        records: z.array(z.object({ id: z.string() })),
      }),
    });

    const records = await recordsAgent.run({
      data: {
        customerId: input.customerId,
      },
    });

    const processedRecords = await Promise.all(
      records.result.records.map((record) => {
        const agent2 = ctx.agent({
          name: "analyzeLoan",
          systemPrompt: helpers.structuredPrompt({
            facts: ["You are a loan risk analyst"],
            goals: [
              "Analyze the loan's asset classes",
              "Determine the risk profile for each asset class",
              "Provide a comprehensive summary of findings",
            ],
          }),
          resultSchema: z.object({
            loanId: z.string(),
            summary: z
              .string()
              .describe(
                "Summary of the loan, asset classes and their risk profile",
              ),
          }),
        });

        ctx.effect(`logFirstAnalyzeLoan`, async () => {
          console.log(
            `This side effect will only be run once. It's running for ${record.id}`,
          );
        });

        return agent2.run({
          data: {
            loanId: record.id,
            customerId: input.customerId,
          },
        });
      }),
    );

    const riskProfile = await ctx
      .agent({
        name: "riskAgent",
        systemPrompt: helpers.structuredPrompt({
          facts: [
            "You are a senior risk assessment specialist",
            "You are given a list of loan records and their risk profiles",
          ],
          goals: [
            "Review all loan analyses and their asset classes",
            "Evaluate the overall customer risk profile",
            "Provide a comprehensive risk summary considering all assets",
          ],
        }),
        resultSchema: z.object({
          summary: z.string(),
        }),
      })
      .run({
        data: {
          customerId: input.customerId,
          assetClassDetails: processedRecords,
        },
      });

    ctx.effect("logFinalResult", async () => {
      console.log("--------------------------------");
      console.log(riskProfile);
      console.log("--------------------------------");
    });
  });

  await workflow.listen();

  await inferable.workflows.run("records", {
    executionId: Date.now().toString(),
    customerId: "customerId-123",
  });
})();
