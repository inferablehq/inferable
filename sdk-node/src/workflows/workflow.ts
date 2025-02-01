import { z } from "zod";
import type { Inferable } from "../Inferable";
import { RegisteredService } from "../types";
import zodToJsonSchema from "zod-to-json-schema";
import { cyrb53 } from "../util/cybr53";
import { InferableAPIError } from "../errors";

type WorkflowInput = {
  executionId: string;
};

type WorkflowConfig<TInput extends WorkflowInput, name extends string> = {
  inferable: Inferable;
  name: name;
  inputSchema: z.ZodType<TInput>;
};

type AgentConfig<TInput, TResult> = {
  name: string;
  systemPrompt: string;
  resultSchema?: z.ZodType<TResult>;
  input?: TInput;
  runId?: string;
};

type WorkflowContext<TInput> = {
  agent: <
    TAgentInput extends { [key: string]: unknown },
    TAgentResult = unknown,
  >(
    config: AgentConfig<TAgentInput, TAgentResult>,
  ) => {
    run: () => Promise<{ result: TAgentResult }>;
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
        this.versionHandlers.set(version, handler);
      },
      run: async (input: TInput) => {
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

        return result;
      },
    };
  }

  private createContext(
    version: number,
    executionId: string,
    input: TInput,
  ): WorkflowContext<TInput> {
    return {
      agent: <
        TAgentInput extends { [key: string]: unknown },
        TAgentResult = unknown,
      >(
        config: AgentConfig<TAgentInput, TAgentResult>,
      ) => {
        return {
          /**
           * Runs the agent.
           * @param params - The parameters for the agent.
           * @param params.input - The input for the agent. Must be a valid JSON object.
           * @param params.runId - The runId for the agent. A unique identifier for the agent run. If not provided, it will be generated based on the agent's configuration and the input.
           * @returns The result of the agent.
           */
          run: async () => {
            const resultSchema = config.resultSchema
              ? zodToJsonSchema(config.resultSchema)
              : undefined;

            const runId = config.runId
              ? `${executionId}.${config.name}.${config.runId}`
              : `${executionId}.${config.name}.${cyrb53(
                  JSON.stringify([
                    config.systemPrompt,
                    resultSchema,
                    config.input,
                    this.name,
                    version,
                  ]),
                )}`;

            console.log("---  Creating run", { runId, name: config.name });

            const result = await this.inferable.getClient().createRun({
              params: {
                clusterId: await this.inferable.getClusterId(),
              },
              body: {
                id: runId,
                systemPrompt: config.systemPrompt,
                resultSchema,
                context: config.input ? { input: config.input } : undefined,
                onStatusChange: {
                  type: "workflow",
                  statuses: ["failed", "done"],
                  workflow: {
                    executionId: executionId,
                  },
                },
                initialPrompt: JSON.stringify(config.input),
              },
            });

            if (result.status !== 201) {
              console.error("Failed to create run", {
                runId,
                status: result.status,
                body: result.body,
              });

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
  }

  async unlisten() {
    await Promise.all(this.services.map((s) => s.stop()));
  }
}
