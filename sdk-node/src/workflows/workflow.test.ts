import { z } from "zod";
import { helpers } from "./workflow";
import { inferableInstance } from "../tests/utils";
import assert from "assert";

describe("workflow", () => {
  jest.setTimeout(60_000);
  it("should run a workflow", async () => {
    const inferable = inferableInstance();

    const onStart = jest.fn();
    const onAgentResult = jest.fn();
    const onSimpleResult = jest.fn();
    const toolCall = jest.fn();

    // Generate a unique workflow name to prevent conflicts with other tests
    const workflowName = `haystack-search-${Math.random().toString(36).substring(2, 15)}`;

    const workflow = inferable.workflows.create({
      name: workflowName,
      inputSchema: z.object({
        executionId: z.string(),
        someOtherInput: z.string(),
      }),
    });

    workflow.tools.register({
      name: "searchHaystack2",
      inputSchema: z.object({
        searchQuery: z.string(),
      }),
      func: async (input) => {
        toolCall(input);
        if (input.searchQuery === "marco") {
          return { word: "not-needle" };
        } else if (input.searchQuery === "marco 42") {
          return { word: "needle" };
        } else {
          return { word: `not-found-${input.searchQuery}` };
        }
      },
    });

    workflow.version(1).define(async (ctx, input) => {
      onStart(input);
      ctx.log("info", { message: "Starting workflow" });
      const { word } = await ctx.agents.react({
        name: "search",
        instructions: helpers.structuredPrompt({
          facts: ["You are haystack searcher"],
          goals: [
            "Find the special word in the haystack. Only search for the words asked explictly by the user.",
          ],
        }),
        schema: z.object({
          word: z.string(),
        }),
        tools: ["searchHaystack2"],
        input: `Try the searchQuery 'marco'.`,
        onBeforeReturn: async (result, agent) => {
          if (result.word !== "needle") {
            await agent.sendMessage("Try the searchQuery 'marco 42'.");
          }
        },
      });

      assert(word === "needle", `Expected word to be "needle", got ${word}`);

      const cachedResult = await ctx.result("testResultCall", async () => {
        return {
          word: "needle",
        };
      });

      assert(
        cachedResult.word === "needle",
        `Expected cachedResult to be "needle", got ${cachedResult.word}`,
      );

      onAgentResult(cachedResult.word);

      ctx.log("info", { message: "About to run simple LLM call" });

      await ctx.llm.structured({
        input: "Return the word, needle.",
        schema: z.object({
          word: z.string(),
        }),
      });

      // Duplicate call
      const simpleResult = await ctx.llm.structured({
        input: "Return the word, needle.",
        schema: z.object({
          word: z.string(),
        }),
      });

      assert(
        simpleResult.word === "needle",
        `Expected simpleResult to be "needle", got ${simpleResult.word}`,
      );

      onSimpleResult(simpleResult.word);

      return {
        word: "needle",
      };
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

    expect(toolCall).toHaveBeenCalledTimes(2);

    expect(onSimpleResult).toHaveBeenCalledWith("needle");
    expect(onSimpleResult).toHaveBeenCalledTimes(1);
  });
});
