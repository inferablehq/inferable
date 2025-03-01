/* eslint-disable no-console */
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

  const fakeLoans = [
    {
      id: "loan-123",
      customerId: "customerId-123",
      amount: 1000,
      status: "active",
      assetClasses: ["123", "456"],
    },
    {
      id: "loan-124",
      customerId: "customerId-123",
      amount: 2000,
      status: "active",
      assetClasses: ["456", "789"],
    },
  ];

  function getAssetClassDetails(assetClassId: string) {
    console.log("getAssetClassDetails:request", { assetClassId });
    if (assetClassId === "123") {
      return {
        name: "property",
        risk: "low",
      };
    }

    if (assetClassId === "456") {
      return {
        name: "government-bonds",
        risk: "very low",
      };
    }

    if (assetClassId === "789") {
      return {
        name: "meme-coins",
        risk: "high",
      };
    }
  }

  workflow.version(1).define(async (ctx, input) => {
    console.log("Starting workflow");
    const recordsAgent = ctx.agent({
      name: "recordsAgent",
      type: "single-step",
      systemPrompt: helpers.structuredPrompt({
        facts: [
          "You are a loan records processor",
          `Customer ID to process: ${input.customerId}`,
          `Here are all the loans for the customer: ${JSON.stringify(fakeLoans)}`,
        ],
        goals: [
          "Retrieve all loans associated with the customer ${input.customerId}",
          "Return a complete list of loan records with their IDs",
        ],
      }),
      resultSchema: z.object({
        records: z.array(
          z.object({ id: z.string(), assetClassIds: z.array(z.string()) }),
        ),
      }),
    });

    await ctx.log("info", {
      message: "Triggering recordsAgent",
    });

    const records = await recordsAgent.trigger({
      data: {
        customerId: input.customerId,
      },
    });

    await ctx.log("info", {
      message: "recordsAgent triggered",
    });

    const processedRecords = await Promise.all(
      records.result.records.map(async (record) => {
        const assetClassDetails =
          record.assetClassIds.map(getAssetClassDetails);

        const agent2 = ctx.agent({
          name: "analyzeLoan",
          systemPrompt: helpers.structuredPrompt({
            facts: [
              "You are a loan risk analyst",
              `Here are the asset classes for the loan: ${JSON.stringify(
                record.assetClassIds,
              )}`,
            ],
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

        const result = await agent2.trigger({
          data: {
            assetClassDetails,
          },
        });

        await ctx.log("info", {
          message: `Processing record ${record.id}`,
          data: {
            recordId: record.id,
            result: result.result,
          },
        });

        return result;
      }),
    );

    await ctx.log("warn", {
      message: "I've processed all the records",
    });

    const riskProfile = await ctx
      .agent({
        type: "single-step",
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
      .trigger({
        data: {
          customerId: input.customerId,
          assetClassDetails: processedRecords.map(
            (record) => record.result.summary,
          ),
        },
      });

    console.log("riskProfile");

    const randomResult = await ctx.result("randomResult", async () => {
      await ctx.log("info", {
        message: "Fetching random result",
      });

      return fetch("https://api.inferable.ai/live").then(
        (res) => res.json() as Promise<{ status: string }>,
      );
    });

    await ctx.log("error", {
      message: "randomResult",
      data: {
        just: {
          testing: {
            errors: ["this is an error"],
          },
        },
      },
    });

    return {
      riskProfile,
      randomResult,
    };
  });

  await workflow.listen();

  await inferable.workflows.trigger("records", {
    executionId: Date.now().toString(),
    customerId: "customerId-123",
  });
})();
