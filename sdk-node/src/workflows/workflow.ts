import { z } from "zod";
import type { Inferable } from "../Inferable";
import { RegisteredService } from "../types";
import zodToJsonSchema from "zod-to-json-schema";
import { cyrb53 } from "../util/cybr53";
import { InferableAPIError } from "../errors";
import debug from "debug";

const log = debug("inferable:workflows");

type WorkflowInput = {
  executionId: string;
};

type WorkflowConfig<TInput extends WorkflowInput, name extends string> = {
  inferable: Inferable;
  name: name;
  inputSchema: z.ZodType<TInput>;
};

type AgentConfig<TResult> = {
  name: string;
  systemPrompt?: string;
  resultSchema?: z.ZodType<TResult>;
  runId?: string;
};

type WorkflowContext<TInput> = {
  effect: (
    name: string,
    fn: (ctx: WorkflowContext<TInput>) => Promise<void>,
  ) => Promise<void>;
  agent: <TAgentResult = unknown>(
    config: AgentConfig<TAgentResult>,
  ) => {
    run: (params: {
      data: { [key: string]: unknown };
    }) => Promise<{ result: TAgentResult }>;
  };
  input: TInput;
};

const DEFAULT_FUNCTION_NAME = "handler";

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
  private inferable: Inferable;
  private services: RegisteredService[] = [];

  constructor(config: WorkflowConfig<TInput, name>) {
    this.name = config.name;
    this.inputSchema = config.inputSchema;
    this.inferable = config.inferable;
  }

  version(version: number) {
    return {
      define: (
        handler: (ctx: WorkflowContext<TInput>, input: TInput) => Promise<void>,
      ) => {
        log("Defining workflow handler", { version, name: this.name });
        this.versionHandlers.set(version, handler);
      },
      run: async (input: TInput) => {
        log("Running workflow", {
          version,
          name: this.name,
          executionId: input.executionId,
        });

        const result = await this.inferable
          .getClient()
          .createWorkflowExecution({
            params: {
              clusterId: await this.inferable.getClusterId(),
              workflowName: this.name,
            },
            body: {
              executionId: input.executionId,
            },
          });

        log("Workflow execution created", {
          version,
          name: this.name,
          executionId: input.executionId,
          status: result.status,
        });

        return result;
      },
    };
  }

  private createContext(
    version: number,
    executionId: string,
    input: TInput,
  ): WorkflowContext<TInput> {
    log("Creating workflow context", {
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
        const result = await this.inferable.getClient().setClusterKV({
          params: {
            clusterId: await this.inferable.getClusterId(),
            key: `${executionId}.${name}`,
          },
          body: {
            value: rand,
            onConflict: "doNothing",
          },
        });

        if (result.status !== 200) {
          throw new Error("Failed to set effect");
        }

        const canRun = result.body.value === rand;

        if (canRun) {
          log(`Effect ${name} can run. Running...`);
          try {
            await fn(ctx);
            log(`Effect ${name} ran successfully`);
          } catch (e) {
            log(`Effect ${name} failed`, { error: e });
          }
        } else {
          log(`Effect ${name} has already been run`);
        }
      },
      agent: <TAgentResult = unknown>(config: AgentConfig<TAgentResult>) => {
        return {
          run: async (params: { data: { [key: string]: unknown } }) => {
            log("Running agent in workflow", {
              version,
              name: this.name,
              executionId,
              agentName: config.name,
            });

            const resultSchema = config.resultSchema
              ? zodToJsonSchema(config.resultSchema)
              : undefined;

            const runId = config.runId
              ? `${executionId}.${config.name}.${config.runId}`
              : `${executionId}.${config.name}.${cyrb53(
                  JSON.stringify([
                    config.systemPrompt,
                    executionId,
                    resultSchema,
                    this.name,
                    version,
                    params.data,
                  ]),
                )}`;

            const result = await this.inferable.getClient().createRun({
              params: {
                clusterId: await this.inferable.getClusterId(),
              },
              body: {
                id: runId,
                systemPrompt: config.systemPrompt,
                resultSchema,
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
              },
            });

            log("Agent run completed", {
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
    log("Starting workflow listeners", {
      name: this.name,
      versions: Array.from(this.versionHandlers.keys()),
    });

    this.versionHandlers.forEach((handler, version) => {
      const s = this.inferable.service({
        name: `workflows-${this.name}-${version}`,
      });

      s.register({
        func: async (input: TInput) => {
          if (!input.executionId) {
            throw new Error(
              "executionId field must be provided in the workflow input, and must be a string",
            );
          }
          const ctx = this.createContext(version, input.executionId, input);
          return handler(ctx, input);
        },
        name: DEFAULT_FUNCTION_NAME,
        schema: {
          input: this.inputSchema,
        },
      });

      this.services.push(s);
    });

    await Promise.all(this.services.map((s) => s.start()));
    log("Workflow listeners started", { name: this.name });
  }

  async unlisten() {
    log("Stopping workflow listeners", { name: this.name });
    await Promise.all(this.services.map((s) => s.stop()));
    log("Workflow listeners stopped", { name: this.name });
  }
}
