import debug from "debug";
import path from "path";
import { z } from "zod";
import { createApiClient } from "./create-client";
import { InferableAPIError, InferableError } from "./errors";
import * as links from "./links";
import { machineId } from "./machine-id";
import { PollingAgent, registerMachine } from "./polling";
import {
  JobContext,
  ToolConfig,
  ToolInput,
  ToolRegistrationInput,
  JsonSchemaInput,
} from "./types";
import { helpers, Workflow } from "./workflows/workflow";
import { ToolConfigSchema } from "./contract";
import L1M from "l1m";

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

  private pollingAgents: PollingAgent[] = [];

  private toolsRegistry: { [key: string]: ToolRegistrationInput<any> } = {};

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

  public tools = {
    /**
     * Registers a tool with Inferable.
     * @param input The tool definition.
     * @example
     * ```ts
     * const client = new Inferable({apiSecret: "API_SECRET"});
     *
     * client.tools.register("hello", z.object({name: z.string()}), async ({name}: {name: string}) => {
     *   return `Hello ${name}`;
     * });
     *
     * // start the service
     * await client.tools.listen();
     *
     * // stop the service on shutdown
     * process.on("beforeExit", async () => {
     *   await client.tools.stop();
     * });
     * ```
     */
    register: <T extends z.ZodTypeAny | JsonSchemaInput>(
      input: ToolRegistrationInput<T>,
    ) => {
      this.registerTool({
        name: input.name,
        description: input.description,
        func: input.func,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: input.schema?.input ?? (z.object({}).passthrough() as any),
        config: input.config,
      });
    },
    listen: async () => {
      if (this.pollingAgents.length > 0) {
        throw new InferableError("Tools already listening");
      }

      // TODO: Create one polling agent per 10 tools
      const agent = new PollingAgent({
        endpoint: this.endpoint,
        machineId: this.machineId,
        apiSecret: this.apiSecret,
        clusterId: await this.getClusterId(),
        tools: Object.values(this.toolsRegistry),
      });

      this.pollingAgents.push(agent);
      await agent.start();
    },
    unlisten: async () => {
      Promise.all(this.pollingAgents.map((agent) => agent.stop()));
    },
  };

  public llm = {
    structured: async <T extends z.ZodObject<any>, TOutput = z.infer<T>>(
      {
        input,
        schema,
        instructions,
      }: {
        input: string;
        schema: T;
        instructions?: string;
      },
      options?: Parameters<L1M["structured"]>[1],
    ): Promise<TOutput> => {
      return new L1M({
        baseUrl: `${this.endpoint}/clusters/${await this.getClusterId()}/l1m`,
        additionalHeaders: {
          Authorization: `Bearer ${this.apiSecret}`,
        },
        provider: {
          key: "",
          model: "claude-3-5-sonnet",
          url: "",
        },
      }).structured({ input, schema, instructions }, options);
    },
  };

  private registerTool<T extends z.ZodTypeAny | JsonSchemaInput>({
    name,
    func,
    inputSchema,
    config,
    description,
  }: {
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    func: (input: ToolInput<T>, context: JobContext) => any;
    inputSchema: T;
    config?: ToolConfig;
    description?: string;
  }) {
    if (this.toolsRegistry[name]) {
      throw new InferableError(`Tool name '${name}' is already registered.`);
    }

    const registration: ToolRegistrationInput<T> = {
      name,
      func,
      schema: {
        input: inputSchema,
      },
      config,
      description,
    };

    const existing = this.pollingAgents.length > 0;

    if (existing) {
      throw new InferableError(
        `Tools must be registered before starting the listener. Please see ${links.DOCS_FUNCTIONS}`,
      );
    }

    if (typeof registration.func !== "function") {
      throw new InferableError(
        `func must be a function. Please see ${links.DOCS_FUNCTIONS}`,
      );
    }

    log(`Registering tool`, {
      name: registration.name,
    });

    this.toolsRegistry[registration.name] = registration;
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
