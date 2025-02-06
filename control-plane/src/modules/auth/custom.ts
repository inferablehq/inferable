import { AuthenticationError, JobPollTimeoutError } from "../../utilities/errors";
import { packer } from "../packer";
import * as jobs from "../jobs/jobs";
import { getJobStatusSync } from "../jobs/jobs";
import { createCache, hashFromSecret } from "../../utilities/cache";
import { getClusterDetails } from "../management";
import { getClusterBackgroundRun } from "../runs";
import { z } from "zod";
import { getToolDefinition } from "../tools";

const customAuthContextCache = createCache<{
  status: "pending" | "running" | "success" | "failure" | "stalled";
  result: string | null;
  resultType: jobs.ResultType | null;
}>(Symbol("customAuthContextCache"));

const customAuthResultSchema = z
  .object({
    userId: z.string(),
  })
  .passthrough();

/**
 * Calls the custom verify function and returns the result
 */
export const verify = async ({
  token,
  clusterId,
}: {
  token: string;
  clusterId: string;
}): Promise<z.infer<typeof customAuthResultSchema>> => {
  const secretHash = hashFromSecret(`${clusterId}:${token}`);

  const cached = await customAuthContextCache.get(secretHash);

  if (cached) {
    if (
      typeof cached === "object" &&
      cached.status === "success" &&
      cached.resultType === "resolution" &&
      cached.result &&
      packer.unpack(cached.result).error === "Custom auth token is not valid"
    ) {
      throw new AuthenticationError(
        "Custom auth token is not valid",
        "https://docs.inferable.ai/pages/custom-auth"
      );
    }

    return cached.result ? packer.unpack(cached.result) : null;
  }

  const { handleCustomAuthFunction } = await getClusterDetails({ clusterId });

  if (!handleCustomAuthFunction) {
    throw new AuthenticationError(
      "Custom auth is not configured for this cluster",
      "https://docs.inferable.ai/pages/custom-auth"
    );
  }

  let authFunction: string | undefined;

  try {
    const definition = await getToolDefinition({
      clusterId,
      name: handleCustomAuthFunction,
    });

    if (!definition) {
      throw new AuthenticationError(
        `${handleCustomAuthFunction} is not registered`,
        "https://docs.inferable.ai/pages/custom-auth"
      );
    }

    const authFunction = definition.name;

    const { id } = await jobs.createJobV2({
      targetFn: authFunction,
      targetArgs: packer.pack({
        token,
      }),
      owner: {
        clusterId,
      },
      runId: getClusterBackgroundRun(clusterId),
    });

    const result = await getJobStatusSync({
      jobId: id,
      owner: { clusterId },
      ttl: 10_000,
    });

    if (result.status == "success" && result.resultType !== "resolution") {
      throw new AuthenticationError(
        "Custom auth token is not valid",
        "https://docs.inferable.ai/pages/custom-auth"
      );
    }

    // This isn't expected
    if (result.status != "success") {
      throw new Error(`Failed to call ${authFunction}: ${result.result}`);
    }

    if (!result.result) {
      throw new AuthenticationError(
        `${authFunction} did not return a result`,
        "https://docs.inferable.ai/pages/custom-auth"
      );
    }

    const parsed = customAuthResultSchema.safeParse(packer.unpack(result.result));

    if (!parsed.success) {
      throw new AuthenticationError(
        `${authFunction} returned invalid result object`,
        "https://docs.inferable.ai/pages/custom-auth"
      );
    }

    await customAuthContextCache.set(secretHash, result, 300);

    return parsed.data;
  } catch (e) {
    if (e instanceof JobPollTimeoutError) {
      throw new AuthenticationError(
        `Call to ${authFunction} did not complete in time`,
        "https://docs.inferable.ai/pages/custom-auth"
      );
    }

    // Cache the auth error for 1 minute
    if (e instanceof AuthenticationError) {
      await customAuthContextCache.set(
        secretHash,
        {
          status: "success",
          result: packer.pack({
            error: `Custom auth token is not valid`,
          }),
          resultType: "resolution",
        },
        60
      );
      throw e;
    }

    throw e;
  }
};
