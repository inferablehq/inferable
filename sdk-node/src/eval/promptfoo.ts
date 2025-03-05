import { ApiProvider, CallApiFunction } from "promptfoo";
import { createApiClient } from "../create-client";
import { z } from "zod";
import { InferableError } from "../errors";
import * as links from "../links";

const mocksSchema = z.record(
  z.object({
    output: z.object({}).passthrough(),
  }),
);

const inputSchema = z.object({
  message: z.string().optional(),
  // JSON string of of mock results
  mocks: z.string().optional(),
  template: z
    .object({
      id: z.string(),
      input: z.record(z.string()),
    })
    .optional(),
});

class InferablePromptfooProvider implements ApiProvider {
  providerId: string;
  controlPlaneClient: ReturnType<typeof createApiClient>;
  apiSecret: string;

  constructor() {
    this.providerId = "InferableProvider";
    this.controlPlaneClient = createApiClient({});

    if (!process.env.INFERABLE_API_SECRET) {
      throw new InferableError(
        `No API Secret provided. Please see ${links.DOCS_AUTH}`,
      );
    }

    this.apiSecret = process.env.INFERABLE_API_SECRET;
  }

  id() {
    return this.providerId;
  }

  callApi: CallApiFunction = async (rawInput, _context, _options) => {
    // Check if prompt is JSON string
    let message: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let inputObject: any | undefined;
    try {
      inputObject = JSON.parse(rawInput);
    } catch {
      // Expected if prompt is not JSON, we will treat it as a message
      message = rawInput;
    }

    let input: z.infer<typeof inputSchema> | undefined;
    if (inputObject) {
      try {
        input = inputSchema.parse(inputObject);
      } catch (e) {
        throw new Error(`Invalid evaluation input: ${e}`);
      }
    }

    let parsedMocks: z.infer<typeof mocksSchema> | undefined;
    if (!!input?.mocks) {
      try {
        parsedMocks = mocksSchema.parse(JSON.parse(input.mocks));
      } catch (e) {
        throw new Error(`Invalid mocks provided: ${e}`);
      }
    }

    const run = await this.run({
      ...(input ? input : { message }),
      test: {
        enabled: true,
        mocks: parsedMocks,
      },
    });

    const result = await this._pollRun(run);

    return {
      output: {
        ...result,
      },
    };
  };

  private async _pollRun(
    run: Awaited<ReturnType<typeof this.run>>,
    attempts = 0,
  ): Promise<{
    id: string;
    status: string;
    failureReason: string | null;
    messages: { type: string; data: unknown }[];
    jobs: {
      id: string;
      status: string;
      service: string;
      function: string;
    }[];
    inputRequests: { id: string }[];
  }> {
    if (attempts > 10) {
      throw new Error("Failed to fetch run after 10 attempts");
    }
    await new Promise((resolve) => setTimeout(resolve, attempts * 5000));

    const details = await run.fetchDetails();

    const terminalStatuses = ["done", "failed"];
    if (details.run.status) {
      const done =
        terminalStatuses.includes(details.run.status) ||
        details.inputRequests.length > 0;

      if (done) {
        return {
          id: details.run.id,
          status: details.run.status,
          failureReason: details.run.failureReason,
          messages: (await run.fetchMessages()).map((m) => ({
            type: m.type,
            data: m.data,
          })),
          jobs: details.jobs.map((j) => ({
            id: j.id,
            status: j.status,
            service: j.service,
            function: j.targetFn,
          })),
          inputRequests: details.inputRequests.map((r) => ({
            id: r.id,
          })),
        };
      }
    }

    return await this._pollRun(run, attempts + 1);
  }

  /**
   * (Starts a new / fetch existing) runs with Inferable.
   * This function can not be called with a machine token.
   *
   * @returns A reference to the run which can be used to fetch the run details and messages.
   */
  private async run({
    test = {
      enabled: false,
    },
    message,
    template,
    runId,
  }: {
    test?: {
      enabled: boolean;
      mocks?: Record<
        string,
        {
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
          output: Record<string, any>;
        }
      >;
    };
    message?: string;
    runId?: string;
    template?: {
      id: string;
      input: Record<string, string>;
    };
  }) {
    if (!process.env.INFERABLE_CLUSTER_ID) {
      throw new InferableError(
        "INFERABLE_CLUSTER_ID must be set to start a run",
      );
    }

    const clusterId = process.env.INFERABLE_CLUSTER_ID;

    // Fetch existing run
    if (runId) {
      if (!!message) {
        throw new InferableError(
          "Cannot specify both existing runId and message",
        );
      }

      if (!!template) {
        throw new InferableError(
          "Cannot specify both existing runId and template",
        );
      }

      const result = await this.controlPlaneClient.getRun({
        params: {
          clusterId,
          runId,
        },
        headers: {
          authorization: this.apiSecret,
        },
      });

      if (result.status !== 200) {
        throw new InferableError("Failed to fetch run details", result);
      }
    } else {
      // Create a new
      const result = await this.controlPlaneClient.createRun({
        body: {
          test,
          message,
          template: template,
        },
        params: {
          clusterId,
        },
        headers: {
          authorization: this.apiSecret,
        },
      });

      if (result.status !== 201) {
        throw new InferableError("Failed to start run", result);
      }

      runId = result.body.id;
    }

    return {
      runId,
      submitFeedback: async (feedback: { comment: string; score: number }) => {
        const result = await this.controlPlaneClient.createFeedback({
          body: feedback,
          params: {
            clusterId,
            runId,
          },
          headers: {
            authorization: this.apiSecret,
          },
        });

        if (result.status !== 204) {
          throw new InferableError("Failed to submit feedback for run");
        }
      },
      fetchDetails: async () => {
        const result = await this.controlPlaneClient.getRunTimeline({
          params: {
            clusterId,
            runId,
          },
          headers: {
            authorization: this.apiSecret,
          },
        });

        if (result.status !== 200) {
          throw new InferableError(`Failed to fetch run ${runId}`);
        }

        return result.body;
      },
      fetchMessages: async () => {
        const result = await this.controlPlaneClient.listMessages({
          params: {
            clusterId,
            runId,
          },
          headers: {
            authorization: this.apiSecret,
          },
        });

        if (result.status !== 200) {
          throw new InferableError(`Failed to fetch run messages ${runId}`);
        }

        return result.body;
      },
    };
  }
}

module.exports = InferablePromptfooProvider;
