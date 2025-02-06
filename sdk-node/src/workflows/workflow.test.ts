import { z } from "zod";
import { Inferable } from "../Inferable";
import { getEphemeralSetup } from "./workflow-test-utils";
import { helpers } from "./workflow";

describe("workflow", () => {
  it("should run a workflow", async () => {
    const ephemeralSetup = await getEphemeralSetup();

    const inferable = new Inferable({
      apiSecret: ephemeralSetup.apiKey,
      endpoint: ephemeralSetup.endpoint,
    });

    const onStart = jest.fn();
    const onDone = jest.fn();
    const toolCall = jest.fn();

    inferable.tools.register({
      func: (_i, _c) => {
        toolCall();
        return {
          word: "needle"
        }
      },
      name: "searchHaystack",
    })

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
        data: {}
      });

      if (!result || !result.result || !result.result.word) {
        throw new Error("No result");
      }

      onDone(result.result.word);
    });

    await workflow.listen();

    const executionId = `${Math.random()}`;
    await inferable.workflows.trigger("haystack-search", {
      executionId,
      someOtherInput: "foo",
    });

    const start = Date.now();
    //poll until onDone is called
    while (!onDone.mock.calls.length || Date.now() - start < 10000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }


    // Test workflow got input
    expect(onStart).toHaveBeenCalledWith({
      executionId,
      someOtherInput: "foo",
    });

    // Test workflow found needle
    expect(onDone).toHaveBeenCalledWith("needle");

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(toolCall).toHaveBeenCalledTimes(1);
  });
});
