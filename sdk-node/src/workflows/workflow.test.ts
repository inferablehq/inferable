import { z } from "zod";
import { helpers } from "./workflow";
import { inferableInstance } from "../tests/utils";

describe("workflow", () => {
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

    const workflow = inferable.workflows.create({
      name: "haystack-search",
      inputSchema: z.object({
        executionId: z.string(),
        someOtherInput: z.string(),
      }),
    });

    workflow.version(1).define(async (ctx, input) => {
      onStart(input);
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

      if (!result || !result.result || !result.result.word) {
        throw new Error("No result");
      }

      onAgentResult(result.result.word);

      const simpleCall = ctx.agent({
        name: "test",
        type: "single-step",
        systemPrompt: "Return the word, needle.",
        resultSchema: z.object({
          word: z.string(),
        }),
      });

      const simpleResult = await simpleCall.trigger({
        data: {},
      });

      if (!simpleResult || !simpleResult.result || !simpleResult.result.word) {
        throw new Error("No simpleResult");
      }
      onSimpleResult(simpleResult.result.word);
    });

    await workflow.listen();

    const executionId = `${Math.random()}`;
    await inferable.workflows.trigger("haystack-search", {
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
      executionId,
      someOtherInput: "foo",
    });

    // Test workflow found needle
    expect(onAgentResult).toHaveBeenCalledWith("needle");
    expect(onAgentResult).toHaveBeenCalledTimes(2);

    expect(toolCall).toHaveBeenCalledTimes(1);

    expect(onSimpleResult).toHaveBeenCalledWith("needle");
    expect(onSimpleResult).toHaveBeenCalledTimes(1);
  });
});
