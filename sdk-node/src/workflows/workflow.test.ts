import { z } from "zod";
import { Inferable } from "../Inferable";
import { createServices } from "./workflow-test-services";
import { getEphemeralSetup } from "./workflow-test-utils";

// Skip until we got the server deployed
describe.skip("workflow", () => {
  it("should run a workflow", async () => {
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

    const onDone = jest.fn();

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
            name: "assetClassAgent",
            systemPrompt: "Get the asset class details for a loan",
            resultSchema: z.object({
              recordId: z.string(),
              summary: z.string().describe("Summary of the asset classes"),
            }),
            input: {
              recordId: record.id,
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
            "Summarize the risk of the customer. Use the asset class details to inform the summary.",
          resultSchema: z.object({
            summary: z.string(),
          }),
          input: {
            customerId: input.customerId,
            assetClassDetails: processedRecords,
          },
        })
        .run();

      onDone(riskProfile);
    });

    await workflow.listen();

    await inferable.workflows.run("records-workflow", {
      executionId: "123",
      customerId: "456",
    });
  });
});
