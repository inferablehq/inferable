import { z } from "zod";
import { helpers } from "./workflow";
import { inferableInstance } from "../tests/utils";

describe("workflow", () => {
  jest.setTimeout(60_000);
  it("should run a workflow", async () => {
    const inferable = inferableInstance();

    const onStart = jest.fn();
    const onAgentResult = jest.fn();
    const onSimpleResult = jest.fn();
    const toolCall = jest.fn();

    inferable.tools.register({
      func: (_i, _c) => {
        toolCall();
        return {
          word: "needle",
        };
      },
      name: "searchHaystack",
    });

    inferable.tools.listen();

    // Generate a unique workflow name to prevent conflicts with other tests
    const workflowName = `haystack-search-${Math.random().toString(36).substring(2, 15)}`;

    const workflow = inferable.workflows.create({
      name: workflowName,
      inputSchema: z.object({
        executionId: z.string(),
        someOtherInput: z.string(),
      }),
    });

    workflow.version(1).define(async (ctx, input) => {
      onStart(input);
      ctx.log("info", { message: "Starting workflow" });
      const searchAgent = ctx.agent({
        name: "search",
        tools: ["searchHaystack"],
        systemPrompt: helpers.structuredPrompt({
          facts: ["You are haystack searcher"],
          goals: ["Find the special word in the haystack"],
        }),
        resultSchema: z.object({
          word: z.string(),
        }),
      });

      const result = await searchAgent.trigger({
        data: {},
      });

      ctx.result("testResultCall", async () => {
        return {
          word: "needle",
        };
      });

      if (!result || !result.result || !result.result.word) {
        throw new Error("No result");
      }

      onAgentResult(result.result.word);

      ctx.log("info", { message: "About to run simple LLM call" });

      await ctx.llm.structured({
        input: "Return the word, needle.",
        schema: z.object({
          word: z.string(),
        })
      });

      // Duplicate call
      const simpleResult = await ctx.llm.structured({
        input: "Return the word, needle.",
        schema: z.object({
          word: z.string(),
        })
      });

      if (!simpleResult || !simpleResult.word) {
        throw new Error("No simpleResult");
      }
      onSimpleResult(simpleResult.word);

    });

    await workflow.listen();

    const executionId = `${Math.random()}`;
    await inferable.workflows.trigger(workflowName, {
      executionId,
      someOtherInput: "foo",
    });

    const start = Date.now();
    //poll until onDone is called
    while (!onSimpleResult.mock.calls.length || Date.now() - start < 10000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Test workflow got input
    expect(onStart).toHaveBeenCalledWith({
      executionId: expect.any(String),
      someOtherInput: "foo",
    });

    // Test workflow found needle
    expect(onAgentResult).toHaveBeenCalledWith("needle");
    expect(onAgentResult).toHaveBeenCalledTimes(1);

    expect(toolCall).toHaveBeenCalledTimes(1);

    expect(onSimpleResult).toHaveBeenCalledWith("needle");
    expect(onSimpleResult).toHaveBeenCalledTimes(1);
  });
});
