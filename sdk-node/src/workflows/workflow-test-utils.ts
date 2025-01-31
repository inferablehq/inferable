import assert from "assert";
import { z } from "zod";

let ephemeralSetup: {
  clusterId: string;
  apiKey: string;
  endpoint: string;
} | null = null;

export const getEphemeralSetup = async (): Promise<{
  clusterId: string;
  apiKey: string;
  endpoint: string;
}> => {
  if (!ephemeralSetup) {
    const response = await fetch(
      `${process.env.INFERABLE_TEST_API_ENDPOINT}/ephemeral-setup`,
      {
        method: "POST",
      },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to create ephemeral setup: ${response.statusText}`,
      );
    }

    const data = z
      .object({
        clusterId: z.string(),
        apiKey: z.string(),
      })
      .parse(await response.json());

    assert(
      process.env.INFERABLE_TEST_API_ENDPOINT,
      "INFERABLE_TEST_API_ENDPOINT is not set",
    );

    ephemeralSetup = {
      ...data,
      endpoint: process.env.INFERABLE_TEST_API_ENDPOINT,
    };
  }

  return ephemeralSetup;
};
