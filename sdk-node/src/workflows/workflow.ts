import { z } from "zod";
import type { Inferable } from "../Inferable";
import zodToJsonSchema from "zod-to-json-schema";
import { cyrb53 } from "../util/cybr53";
import { InferableAPIError, InferableError } from "../errors";
import { createApiClient } from "../create-client";
import { PollingAgent } from "../polling";
import { ToolRegistrationInput } from "../types";

type WorkflowInput = {
  executionId: string;
};

type Logger = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

type WorkflowConfig<TInput extends WorkflowInput, name extends string> = {
  inferable: Inferable;
  name: name;
  inputSchema: z.ZodType<TInput>;
  logger?: Logger;
  client: ReturnType<typeof createApiClient>;
  getClusterId: () => Promise<string>;
  endpoint: string;
  machineId: string;
  apiSecret: string;
};

type AgentConfig<TResult> = {
  name: string;
  systemPrompt?: string;
  tools?: string[];
  resultSchema?: z.ZodType<TResult>;
  runId?: string;
};

type WorkflowContext<TInput> = {
  effect: (name: string, fn: () => Promise<void>) => Promise<void>;
  result: <TResult>(
    name: string,
    fn: () => Promise<TResult>,
  ) => Promise<TResult>;
  agent: <TAgentResult = unknown>(
    config: AgentConfig<TAgentResult>,
  ) => {
    trigger: (params: {
      data: { [key: string]: unknown };
    }) => Promise<{ result: TAgentResult }>;
  };
  input: TInput;
};

class WorkflowPausableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowPausableError";
  }
}

class WorkflowTerminableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowTerminableError";
  }
}

export const helpers = {
  structuredPrompt: (params: { facts: string[]; goals: string[] }): string => {
    return [
      "# Facts",
      ...params.facts.map((f) => `- ${f}`),
      "# Your goals",
      ...params.goals.map((g) => `- GOAL: ${g}`),
    ].join("\n");
  },
};

export class Workflow<TInput extends WorkflowInput, name extends string> {
  private name: string;
  private inputSchema: z.ZodType<TInput>;
  private versionHandlers: Map<
    number,
    (ctx: WorkflowContext<TInput>, input: TInput) => Promise<unknown>
  > = new Map();
  private pollingAgent: PollingAgent | undefined;
  private getClusterId: () => Promise<string>;
  private client: ReturnType<typeof createApiClient>;
  private logger?: Logger;

  private endpoint: string;
  private machineId: string;
  private apiSecret: string;

  constructor(config: WorkflowConfig<TInput, name>) {
    this.name = config.name;
    this.inputSchema = config.inputSchema;
    this.logger = config.logger;
    this.client = config.client;

    this.getClusterId = config.getClusterId;
    this.endpoint = config.endpoint;
    this.machineId = config.machineId;
    this.apiSecret = config.apiSecret;
  }

  version(version: number) {
    return {
      define: (
        handler: (ctx: WorkflowContext<TInput>, input: TInput) => Promise<void>,
      ) => {
        this.logger?.info("Defining workflow handler", {
          version,
          name: this.name,
        });
        this.versionHandlers.set(version, handler);
      },
      run: async (input: TInput) => {
        this.logger?.info("Running workflow", {
          version,
          name: this.name,
          executionId: input.executionId,
        });

        try {
          const result = await this.client.createWorkflowExecution({
            params: {
              clusterId: await this.getClusterId(),
              workflowName: this.name,
            },
            body: {
              executionId: input.executionId,
            },
          });

          this.logger?.info("Workflow execution created", {
            version,
            name: this.name,
            executionId: input.executionId,
            status: result.status,
          });

          return result;
        } catch (error) {
          this.logger?.error("Failed to create workflow execution", {
            version,
            name: this.name,
            executionId: input.executionId,
            error,
          });
          throw error;
        }
      },
    };
  }

  private createContext(
    version: number,
    executionId: string,
    input: TInput,
  ): WorkflowContext<TInput> {
    this.logger?.info("Creating workflow context", {
      version,
      name: this.name,
      executionId,
    });

    return {
      effect: async (
        name: string,
        fn: (ctx: WorkflowContext<TInput>) => Promise<void>,
      ) => {
        const ctx = this.createContext(version, executionId, input);

        const rand = crypto.randomUUID();

        // TODO: async/retry
        const result = await this.client.setClusterKV({
          params: {
            clusterId: await this.getClusterId(),
            key: `${executionId}.${name}`,
          },
          body: {
            value: rand,
            onConflict: "doNothing",
          },
        });

        if (result.status !== 200) {
          this.logger?.error("Failed to set effect", {
            name,
            executionId,
            status: result.status,
          });
          throw new Error("Failed to set effect");
        }

        const canRun = result.body.value === rand;

        if (canRun) {
          this.logger?.info(`Effect ${name} starting execution`, {
            executionId,
          });
          try {
            await fn(ctx);
            this.logger?.info(`Effect ${name} completed successfully`, {
              executionId,
            });
          } catch (e) {
            this.logger?.error(`Effect ${name} failed`, {
              executionId,
              error: e,
            });
            throw e;
          }
        } else {
          this.logger?.info(`Effect ${name} has already been run`, {
            executionId,
          });
        }
      },
      result: async <TResult>(
        name: string,
        fn: (ctx: WorkflowContext<TInput>) => Promise<TResult>,
      ): Promise<TResult> => {
        const ctx = this.createContext(version, executionId, input);

        const serialize = (value: unknown) => JSON.stringify({ value });
        const deserialize = (value: string) => {
          try {
            return JSON.parse(value).value;
          } catch (e) {
            return null;
          }
        };

        const existingValue = await this.client.getClusterKV({
          params: {
            clusterId: await this.getClusterId(),
            key: `${executionId}.${name}`,
          },
        });

        if (existingValue.status === 200) {
          const existingValueParsed = deserialize(existingValue.body.value);

          if (existingValueParsed) {
            return existingValueParsed;
          }
        }

        const result = await fn(ctx);

        // TODO: async/retry
        const setResult = await this.client.setClusterKV({
          params: {
            clusterId: await this.getClusterId(),
            key: `${executionId}.${name}`,
          },
          body: {
            value: serialize(result),
            onConflict: "doNothing",
          },
        });

        if (setResult.status !== 200) {
          this.logger?.error("Failed to set result", {
            name,
            executionId,
            status: setResult.status,
          });

          throw new Error("Failed to set result");
        }

        return deserialize(setResult.body.value);
      },
      agent: <TAgentResult = unknown>(config: AgentConfig<TAgentResult>) => {
        return {
          trigger: async (params: { data: { [key: string]: unknown } }) => {
            this.logger?.info("Running agent in workflow", {
              version,
              name: this.name,
              executionId,
              agentName: config.name,
            });

            const resultSchema = config.resultSchema
              ? zodToJsonSchema(config.resultSchema)
              : undefined;

            const runId = config.runId
              ? `${executionId}_${config.name}_${config.runId}`
              : `${executionId}_${config.name}_${cyrb53(
                  JSON.stringify([
                    config.systemPrompt,
                    executionId,
                    resultSchema,
                    this.name,
                    version,
                    params.data,
                  ]),
                )}`;

            const result = await this.client.createRun({
              params: {
                clusterId: await this.getClusterId(),
              },
              body: {
                name: `${this.name}_${config.name}`,
                id: runId,
                systemPrompt: config.systemPrompt,
                resultSchema,
                tools: config.tools,
                onStatusChange: {
                  type: "workflow",
                  statuses: ["failed", "done"],
                  workflow: {
                    executionId: executionId,
                  },
                },
                tags: {
                  "workflow.name": this.name,
                  "workflow.version": version.toString(),
                  "workflow.executionId": executionId,
                },
                initialPrompt: JSON.stringify(params.data),
                interactive: false,
              },
            });

            this.logger?.info("Agent run completed", {
              version,
              name: this.name,
              executionId,
              agentName: config.name,
              runId,
              status: result.status,
              result: result.body,
            });

            if (result.status !== 201) {
              // TODO: Add better error handling
              throw new InferableAPIError(
                `Failed to create run: ${result.status}`,
                result,
              );
            }

            if (result.body.status === "done") {
              return {
                result: result.body.result as TAgentResult,
              };
            } else if (result.body.status === "failed") {
              throw new WorkflowTerminableError(
                `Run ${runId} failed. As a result, we've failed the entire workflow (executionId: ${executionId}). Please refer to run failure details for more information.`,
              );
            } else {
              throw new WorkflowPausableError(`Run ${runId} is not done.`);
            }
          },
        };
      },
      input,
    };
  }

  async listen() {
    if (this.pollingAgent) {
      throw new InferableError("Workflow already listening");
    }

    this.logger?.info("Starting workflow listeners", {
      name: this.name,
      versions: Array.from(this.versionHandlers.keys()),
    });

    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: ToolRegistrationInput<any>[] = [];

    this.versionHandlers.forEach((handler, version) => {
      tools.push({
        func: async (input: TInput) => {
          if (!input.executionId) {
            const error =
              "executionId field must be provided in the workflow input, and must be a string";
            this.logger?.error(error);
            throw new Error(error);
          }
          const ctx = this.createContext(version, input.executionId, input);
          return handler(ctx, input);
        },
        name: `workflows_${this.name}_${version}`,
        schema: {
          input: this.inputSchema,
        },
        config: {
          private: true,
        },
      });
    });

    this.pollingAgent = new PollingAgent({
      endpoint: this.endpoint,
      machineId: this.machineId,
      apiSecret: this.apiSecret,
      clusterId: await this.getClusterId(),
      tools,
    });

    try {
      await this.pollingAgent.start();
      this.logger?.info("Workflow listeners started", { name: this.name });
    } catch (error) {
      this.logger?.error("Failed to start workflow listeners", {
        name: this.name,
        error,
      });
      throw error;
    }
  }

  async unlisten() {
    this.logger?.info("Stopping workflow listeners", { name: this.name });

    try {
      await this.pollingAgent?.stop();
      this.logger?.info("Workflow listeners stopped", { name: this.name });
    } catch (error) {
      this.logger?.error("Failed to stop workflow listeners", {
        name: this.name,
        error,
      });
      throw error;
    }
  }
}
