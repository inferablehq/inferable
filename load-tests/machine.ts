import { Inferable } from "inferable";
import { z } from "zod";

const API_SECRET = process.env.INFERABLE_TEST_API_SECRET;

const machineId = `load-test-${Math.floor(Math.random() * 1000000)}`;

const client = new Inferable({
  apiSecret: API_SECRET,
  machineId,
});

client.tools.register({
  func: (_, context) => {
    console.log("Handling request", context);
    return {
      word: "needle",
    };
  },
  name: "searchHaystack",
});

client.tools.listen().then(() => {
  console.log("Tool registered", {
    machineId,
  });
});

const workflow = client.workflows.create({
  name: "searchHaystack",
  config: {
    retryCountOnStall: 2,
    timeoutSeconds: 60,
  },
  inputSchema: z.object({
    executionId: z.string().min(1).max(100),
  }),
});

workflow.version(1).define(async (input, ctx) => {
  const agent = ctx.agent({
    name: "searchHaystack",
    systemPrompt: "Get the special word from the `searchHaystack` function",
    resultSchema: z.object({
      word: z.string(),
    }),
  });

  const result = await agent.trigger({ data: {} });
  return result.result;
});

workflow.listen().then(() => {
  console.log("Workflow registered", {
    machineId,
  });
});
