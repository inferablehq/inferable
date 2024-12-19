import { Inferable } from "./Inferable";
import { z } from "zod";
import { TEST_ENDPOINT } from "./tests/utils";
import { TEST_API_SECRET } from "./tests/utils";

describe("assertions", () => {
  it("should be able to assert a run", async () => {
    const client = new Inferable({
      apiSecret: TEST_API_SECRET,
      endpoint: TEST_ENDPOINT,
    });

    let timesRun = 0;

    client.default.register({
      name: "generateRandomNumber",
      func: async ({ seed }: { seed: number }) => {
        timesRun++;

        return seed * timesRun;
      },
    });

    await client.default.start();

    const resultSchema = z.object({
      result: z.number().describe("The result of the function"),
    });

    const run = await client.run({
      initialPrompt:
        "Use the available functions to generate a random number between 0 and 100",
      resultSchema: resultSchema,
    });

    const result = await run.poll<z.infer<typeof resultSchema>>({
      assertions: [
        function assertCorrect(result) {
          if (timesRun === 1) {
            throw new Error(
              `The result ${result.result} is unacceptable. Try again with a different seed.`,
            );
          }
        },
      ],
    });

    expect(result.result).toBeGreaterThan(0);
  });
});
