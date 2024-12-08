import { createApiClient } from "./create-client";

type FunctionCall = {
  service: string;
  function: string;
};

type AssertionFunction<T> = (
  result: T,
  functionCalls: FunctionCall[],
) => void | Promise<void>;

export type Assertions<T> = AssertionFunction<T>[];

export async function assertRun<T>({
  clusterId,
  runId,
  client,
  result,
  functionCalls,
  assertions,
}: {
  clusterId: string;
  runId: string;
  client: ReturnType<typeof createApiClient>;
  result: T;
  functionCalls: FunctionCall[];
  assertions: Assertions<T>;
}): Promise<{
  assertionsPassed: boolean;
}> {
  const results = await Promise.allSettled(
    assertions.map(async (a) => await a(result, functionCalls)),
  );

  const hasRejections = results.some((r) => r.status === "rejected");

  if (hasRejections) {
    await client.createMessage({
      body: {
        message: [
          `You attempted to return a result, but I have determined the result is possibly incorrect due to failing assertions.`,
          `<failures>`,
          ...results
            .filter((r) => r.status === "rejected")
            .map((r) => r.reason),
          `</failures>`,
        ].join("\n"),
        type: "human",
      },
      params: {
        clusterId,
        runId,
      },
    });

    return {
      assertionsPassed: false,
    };
  }

  return {
    assertionsPassed: true,
  };
}
