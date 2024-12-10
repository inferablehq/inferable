import {
  AuthenticationError,
  InvalidJobArgumentsError,
  JobPollTimeoutError,
} from "../../utilities/errors";
import { packer } from "../packer";
import * as jobs from "../jobs/jobs";
import { getJobStatusSync } from "../jobs/jobs";

export const VERIFY_FUNCTION_NAME = "handleCustomerAuth";
export const VERIFY_FUNCTION_SERVICE = "default";
const VERIFY_FUNCTION_ID = `${VERIFY_FUNCTION_SERVICE}_${VERIFY_FUNCTION_NAME}`;

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
  try {
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
      ttl: 5_000,
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
