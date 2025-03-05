import debug from "debug";
import path from "path";
import { z } from "zod";
import { ToolConfigSchema } from "./contract";
import { createApiClient } from "./create-client";
import { InferableAPIError, InferableError } from "./errors";
import * as links from "./links";
import { machineId } from "./machine-id";
import { registerMachine } from "./polling";
import { helpers, Workflow } from "./workflows/workflow";

// Custom json formatter
debug.formatters.J = (json) => {
  return JSON.stringify(json, null, 2);
};

export const log = debug("inferable:client");

/**
 * The Inferable client. This is the main entry point for using Inferable.
 *
 * ```ts
 * // create a new Inferable instance
 * const client = new Inferable({
 *  apiSecret: "API_SECRET",
 * });
 *
 *
 * // Register a tool
 * client.tools.register("hello", z.object({name: z.string()}), async ({name}: {name: string}) => {
 *  return `Hello ${name}`;
 * })
 *
 * await client.tools.listen();
 *
 * // stop the service on shutdown
 * process.on("beforeExit", async () => {
 *   await myService.stop();
 * });
 *
 * ```
 */
export class Inferable {
  static getVersion(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    return require(path.join(__dirname, "..", "package.json")).version;
  }

  private clusterId?: string;

  private apiSecret: string;
  private endpoint: string;
  private machineId: string;

  private client: ReturnType<typeof createApiClient>;

  /**
   * Initializes a new Inferable instance.
   * @param apiSecret The API Secret for your Inferable cluster. If not provided, it will be read from the `INFERABLE_API_SECRET` environment variable.
   * @param options Additional options for the Inferable client.
   * @param options.endpoint The endpoint for the Inferable cluster. Defaults to https://api.inferable.ai.
   *
   * @example
   * ```ts
   * // Basic usage
   * const client = new Inferable({
   *  apiSecret: "API_SECRET",
   * });
   *
   * // OR
   *
   * process.env.INFERABLE_API_SECRET = "API_SECRET";
   * const client = new Inferable();
   * ```
   */
  constructor(options?: {
    apiSecret?: string;
    endpoint?: string;
    machineId?: string;
  }) {
    if (options?.apiSecret && process.env.INFERABLE_API_SECRET) {
      log(
        "API Secret was provided as an option and environment variable. Constructor argument will be used.",
      );
    }

    const apiSecret = options?.apiSecret || process.env.INFERABLE_API_SECRET;

    if (!apiSecret) {
      throw new InferableError(
        `No API Secret provided. Please see ${links.DOCS_AUTH}`,
      );
    }

    if (!apiSecret.startsWith("sk_")) {
      throw new InferableError(
        `Invalid API Secret. Please see ${links.DOCS_AUTH}`,
      );
    }

    this.apiSecret = apiSecret;

    this.endpoint =
      options?.endpoint ||
      process.env.INFERABLE_API_ENDPOINT ||
      "https://api.inferable.ai";

    this.machineId = options?.machineId || machineId();

    this.client = createApiClient({
      baseUrl: this.endpoint,
      machineId: this.machineId,
      apiSecret: this.apiSecret,
    });
  }

  private async getClusterId() {
    if (!this.clusterId) {
      // Call register machine without any services to test API key and get clusterId
      const registerResult = await registerMachine(this.client);
      this.clusterId = registerResult.clusterId;
    }

    return this.clusterId;
  }

  workflows = {
    helpers,
    create: <TInput extends z.ZodTypeAny>({
      name,
      description,
      inputSchema,
      config,
    }: {
      name: string;
      description?: string;
      inputSchema: TInput;
      config?: z.infer<typeof ToolConfigSchema>;
    }) => {
      return new Workflow({
        name,
        inferable: this,
        description,
        config,
        getClusterId: async () => await this.getClusterId(),
        client: this.client,
        inputSchema,
        endpoint: this.endpoint,
        machineId: this.machineId,
        apiSecret: this.apiSecret,
      });
    },
    trigger: async <TWorkflowInput extends { executionId: string }>(
      name: string,
      input: TWorkflowInput,
    ): Promise<void> => {
      const clusterId = await this.getClusterId();

      const result = await this.client.createWorkflowExecution({
        params: {
          clusterId,
          workflowName: name,
        },
        body: input,
      });

      if (result.status !== 201) {
        throw new InferableAPIError(
          "Failed to create workflow execution",
          result,
        );
      }
    },
  };
}
