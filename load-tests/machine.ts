import { Inferable } from 'inferable'
import { z } from 'zod'

const API_SECRET = process.env.INFERABLE_TEST_API_SECRET

const machineId = `load-test-${Math.floor(Math.random() * 1000000)}`

const client = new Inferable({
  apiSecret: API_SECRET,
  machineId,
})

const workflow = client.workflows.create({
  name: "searchHaystack",
  config: {
    retryCountOnStall: 2,
    timeoutSeconds: 60,
  },
  inputSchema: z.object({
    executionId: z.string().min(1).max(100),
  }),
})


workflow.tools.register({
  func: async (_, context) => {
    console.log("Handling request", context)
    return {
      word: "needle"
    }
  },
  name: "searchHaystack",
})

workflow.version(1).define(async (ctx, input) => {
  const result = ctx.agents.react({
    name: "searchHaystack",
    instructions: 'Get the special word from the `searchHaystack` function',
    input: "   ",
    schema: z.object({
      word: z.string(),
    }),
    tools: ["searchHaystack"],
  });

  return result;
})


workflow.listen().then(() => {
  console.log("Workflow registered", {
    machineId
  })
})
