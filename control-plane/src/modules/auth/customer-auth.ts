import {
  AuthenticationError,
  InvalidJobArgumentsError,
  JobPollTimeoutError,
} from "../../utilities/errors";
import { packer } from "../packer";
import * as jobs from "../jobs/jobs";
import { getJobStatusSync } from "../jobs/jobs";
import { getServiceDefinition } from "../service-definitions";
import { createCache, hashFromSecret } from "../../utilities/cache";

export const VERIFY_FUNCTION_NAME = "handleCustomerAuth";
export const VERIFY_FUNCTION_SERVICE = "default";
const VERIFY_FUNCTION_ID = `${VERIFY_FUNCTION_SERVICE}_${VERIFY_FUNCTION_NAME}`;

const customerAuthContextCache = createCache<unknown>(
  Symbol("customerAuthContextCache"),
);

/**
 * Calls the customer provided verify function and returns the result
 */
export const verifyCustomerProvidedAuth = async ({
  token,
  clusterId,
}: {
  token: string;
  clusterId: string;
}): Promise<unknown> => {

  const secretHash = hashFromSecret(token);

  const cached = await customerAuthContextCache.get(secretHash);
  if (cached) {
    return cached;
  }

  try {
    const serviceDefinition = await getServiceDefinition({
      service: VERIFY_FUNCTION_SERVICE,
      owner: {
        clusterId: clusterId,
      },
    });

    const functionDefinition = serviceDefinition?.functions?.find(
      (f) => f.name === VERIFY_FUNCTION_NAME,
    );


    if (!functionDefinition) {
      throw new AuthenticationError(
        `${VERIFY_FUNCTION_ID} is not registered`,
        "https://docs.inferable.ai/pages/auth#handlecustomerauth"
      );
    }

    const { id } = await jobs.createJob({
      service: VERIFY_FUNCTION_SERVICE,
      targetFn: VERIFY_FUNCTION_NAME,
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

    if (
      result.status !== "success" ||
      result.resultType !== "resolution" ||
      !result.result
    ) {
      throw new AuthenticationError(
        `Call to ${VERIFY_FUNCTION_ID} failed. Result: ${result.result}`,
      );
    }

    await customerAuthContextCache.set(secretHash, result, 300);

    return packer.unpack(result.result);
  } catch (e) {
    if (e instanceof JobPollTimeoutError) {
      throw new AuthenticationError(
        `Call to ${VERIFY_FUNCTION_ID} did not complete in time`,
      );
    }

    if (e instanceof InvalidJobArgumentsError) {
      throw new AuthenticationError(
        `Could not find ${VERIFY_FUNCTION_ID} registration`,
      );
    }
    throw e;
  }
};
