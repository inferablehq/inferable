import { AuthenticationError, JobPollTimeoutError } from "../../utilities/errors";
import { packer } from "../packer";
import * as jobs from "../jobs/jobs";
import { getJobStatusSync } from "../jobs/jobs";
import { getServiceDefinition } from "../service-definitions";
import { createCache, hashFromSecret } from "../../utilities/cache";
import { getClusterDetails } from "../management";

const customAuthContextCache = createCache<unknown>(Symbol("customAuthContextCache"));

/**
 * Calls the custom verify function and returns the result
 */
export const verify = async ({
  token,
  clusterId,
}: {
  token: string;
  clusterId: string;
}): Promise<unknown> => {
  const secretHash = hashFromSecret(`${clusterId}:${token}`);

  const cached = await customAuthContextCache.get(secretHash);

  if (cached) {
    if (typeof cached === "object" && "error" in cached && typeof cached.error === "string") {
      throw new AuthenticationError(cached.error, "https://docs.inferable.ai/pages/custom-auth");
    }
    return cached;
  }

  const { handleCustomAuthFunction } = await getClusterDetails({ clusterId });

  const [authService, authFunction] = handleCustomAuthFunction.split(".");

  try {
    const serviceDefinition = await getServiceDefinition({
      service: authService,
      owner: {
        clusterId: clusterId,
      },
    });

    const functionDefinition = serviceDefinition?.functions?.find(f => f.name === authFunction);

    if (!functionDefinition) {
      throw new AuthenticationError(
        `${authFunction} is not registered`,
        "https://docs.inferable.ai/pages/custom-auth"
      );
    }

    const { id } = await jobs.createJob({
      service: authService,
      targetFn: authFunction,
      targetArgs: packer.pack({
        token,
      }),
      owner: {
        clusterId,
      },
    });

    const result = await getJobStatusSync({
      jobId: id,
      owner: { clusterId },
      ttl: 15_000,
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

    await customAuthContextCache.set(secretHash, result, 300);

    return packer.unpack(result.result);
  } catch (e) {
    if (e instanceof JobPollTimeoutError) {
      throw new AuthenticationError(
        `Call to ${authFunction} did not complete in time`,
        "https://docs.inferable.ai/pages/custom-auth"
      );
    }

    // Cache the auth error for 1 minutes
    if (e instanceof AuthenticationError) {
      await customAuthContextCache.set(
        secretHash,
        {
          error: e.message,
        },
        60
      );
      throw e;
    }

    throw e;
  }
};
