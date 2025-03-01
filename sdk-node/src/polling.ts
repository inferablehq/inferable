import debug from "debug";
import { z } from "zod";
import { createApiClient } from "./create-client";
import { InferableAPIError, InferableError } from "./errors";
import { serializeError } from "./serialize-error";
import { executeFn, Result } from "./execute-fn";
import { ToolRegistrationInput } from "./types";
import { extractBlobs, isZodType, validateFunctionArgs } from "./util";
import zodToJsonSchema from "zod-to-json-schema";

const DEFAULT_RETRY_AFTER_SECONDS = 10;

export const log = debug("inferable:client:polling-agent");

type JobMessage = {
  id: string;
  function: string;
  input?: unknown;
  authContext?: unknown;
  runContext?: string;
  approved: boolean;
};

export class PollingAgent {
  public clusterId: string;
  public polling = false;

  private tools: ToolRegistrationInput<any>[] = [];

  private client: ReturnType<typeof createApiClient>;

  private retryAfter = DEFAULT_RETRY_AFTER_SECONDS;

  constructor(options: {
    endpoint: string;
    machineId: string;
    apiSecret: string;
    clusterId: string;
    tools: ToolRegistrationInput<any>[];
  }) {
    this.client = createApiClient({
      baseUrl: options.endpoint,
      machineId: options.machineId,
      apiSecret: options.apiSecret,
    });

    this.tools = options.tools;

    this.clusterId = options.clusterId;
  }

  public async start() {
    log("Starting polling agent");
    await registerMachine(this.client, this.tools);

    // Purposefully not awaited
    this.runLoop();
  }

  public async stop(): Promise<void> {
    log("Stopping polling agent");
    this.polling = false;
  }

  private async runLoop() {
    this.polling = true;

    let failureCount = 0;

    while (this.polling) {
      try {
        await this.pollIteration();
        if (failureCount > 0) {
          log(`Poll iteration recovered after ${failureCount} failures`);
          failureCount = 0;
        }
      } catch (e) {
        log("Failed poll iteration", {
          failureCount,
          error: e,
        });

        failureCount++;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.retryAfter * 1000),
      );
    }

    //@eslint-disable-next-line no-console
    console.error("Quitting polling agent");
  }

  private async pollIteration() {
    if (!this.clusterId) {
      throw new Error("Failed to poll. Could not find clusterId");
    }

    const tools = this.tools.map((fn) => fn.name);

    const pollResult = await this.client.listJobs({
      params: {
        clusterId: this.clusterId,
      },
      query: {
        tools: tools.join(","),
        status: "pending",
        acknowledge: true,
        limit: 10,
      },
    });

    const retryAfterHeader = pollResult.headers.get("retry-after");
    if (retryAfterHeader && !isNaN(Number(retryAfterHeader))) {
      this.retryAfter = Number(retryAfterHeader);
    }

    if (pollResult?.status === 410) {
      await registerMachine(this.client, this.tools);
    }

    if (pollResult?.status !== 200) {
      throw new InferableError("Failed to fetch calls", {
        status: pollResult?.status,
        body: pollResult?.body,
      });
    }

    const results = await Promise.allSettled(
      pollResult.body.map(async (job) => {
        await this.processCall(job);
      }),
    );

    if (results.length > 0) {
      log("Completed poll iteration", {
        results: results.map((r) => r.status),
      });
    }
  }

  private async processCall(call: JobMessage): Promise<void> {
    const registration = this.tools.find((fn) => fn.name === call.function);

    if (!registration) {
      log("Received call for unknown function", {
        function: call.function,
      });
      return;
    }

    log("Executing job", {
      id: call.id,
      function: call.function,
      registered: !!registration,
    });

    const onComplete = async (result: Result) => {
      log("Persisting job result", {
        id: call.id,
        function: call.function,
        resultType: result.type,
        functionExecutionTime: result.functionExecutionTime,
      });

      const contentAndBlobs = extractBlobs(result.content);

      const persistResult = this.client
        .createJobResult({
          headers: {
            "x-sentinel-unmask-keys": "resultType,functionExecutionTime",
          },
          body: {
            result: contentAndBlobs.content,
            resultType: result.type,
            meta: {
              functionExecutionTime: result.functionExecutionTime,
            },
          },
          params: {
            jobId: call.id,
            clusterId: this.clusterId!,
          },
        })
        .then(async (res) => {
          if (res.status === 204) {
            log("Completed job", call.id, call.function);
          } else {
            throw new InferableError(`Failed to persist call: ${res.status}`, {
              jobId: call.id,
              body: JSON.stringify(res.body),
            });
          }
        });

      const persistBlobs = contentAndBlobs.blobs.map((blob) =>
        this.client
          .createJobBlob({
            headers: {
              "x-sentinel-no-mask": "1",
            },
            params: {
              jobId: call.id,
              clusterId: this.clusterId!,
            },
            body: blob,
          })
          .then(async (res) => {
            if (res.status === 201) {
              log("Uploaded blob", call.id, call.function);
            } else {
              throw new InferableError(`Failed to upload blob: ${res.status}`, {
                jobId: call.id,
                blobName: blob.name,
                body: JSON.stringify(res.body),
              });
            }
          }),
      );

      await Promise.all([persistResult, ...persistBlobs]);
    };

    const args = call.input;

    log("Executing fn", {
      id: call.id,
      function: call.function,
      registeredFn: registration.func,
      args,
    });

    if (typeof args !== "object" || Array.isArray(args) || args === null) {
      log(
        "Function was called with invalid invalid format. Expected an object.",
        {
          function: call.function,
        },
      );

      return onComplete({
        type: "rejection",
        content: serializeError(
          new Error(
            "Function was called with invalid invalid format. Expected an object.",
          ),
        ),
        functionExecutionTime: 0,
      });
    }

    try {
      validateFunctionArgs(registration.schema, args);
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        e.errors.forEach((error) => {
          log("Function input does not match schema", {
            function: call.function,
            path: error.path,
            error: error.message,
          });
        });
      }

      return onComplete({
        type: "rejection",
        content: serializeError(e),
        functionExecutionTime: 0,
      });
    }

    const result = await executeFn(registration.func, [
      args,
      {
        authContext: call.authContext,
        runContext: call.runContext,
        approved: call.approved,
      },
    ]);

    await onComplete(result);
  }
}

export const registerMachine = async (
  client: ReturnType<typeof createApiClient>,
  tools?: ToolRegistrationInput<any>[],
) => {
  log("registering machine", {
    tools: tools?.map((f) => f.name),
  });
  const registerResult = await client.createMachine({
    headers: {
      "x-sentinel-no-mask": "1",
    },
    body: {
      tools: tools?.map((func) => ({
        name: func.name,
        description: func.description,
        schema: JSON.stringify(
          isZodType(func.schema?.input)
            ? zodToJsonSchema(func.schema?.input)
            : func.schema?.input,
        ),
        config: func.config,
      })),
    },
  });

  if (registerResult?.status !== 200) {
    log("Failed to register machine", registerResult);
    throw new InferableAPIError("Failed to register machine", registerResult);
  }

  return {
    clusterId: registerResult.body.clusterId,
  };
};
