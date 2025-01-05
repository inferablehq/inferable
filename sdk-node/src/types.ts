import { z } from "zod";
import { FunctionConfigSchema } from "./contract";

/**
 * Context object which is passed to function calls
 */
export type ContextInput = {
  authContext?: unknown;
  runContext?: unknown;
  approved: boolean;
};

export type FunctionConfig = z.infer<typeof FunctionConfigSchema>;

export type FunctionInput<T extends z.ZodTypeAny | JsonSchemaInput> =
  T extends z.ZodObject<infer Input>
    ? {
        [K in keyof Input]: z.infer<Input[K]>;
      }
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any;

/**
 * Schema for onStatusChange functions
 *
 * @see {@link https://docs.inferable.ai/pages/runs#onstatuschange}
 * @example
 * ```ts
 * inferable.default.register({
 *   name: "onStatusChangeFn",
 *   schema: {
 *    input: onStatusChangeInput
 *   },
 *   func: (_input) => {},
 * });
 * ```
 */
export const onStatusChangeInput = z.object({
  runId: z.string(),
  status: z.enum(["pending", "running", "paused", "done", "failed"]),
  result: z.object({}).passthrough().nullable().optional(),
  summary: z.string().nullable().optional(),
  tags: z.record(z.string()).nullable().optional(),
});

/**
 * Schema for handleCustomAuth functions
 *
 * @see {@link https://docs.inferable.ai/pages/custom-auth}
 * @example
 * ```ts
 * inferable.default.register({
 *   name: "handleCustomAuth",
 *   schema: {
 *    input: handleCustomAuthInput
 *   },
 *   func: (_input) => {},
 * });
 * ```
 */
export const handleCustomAuthInput = z.object({
  token: z.string(),
});


import type { JSONSchema4Type } from "json-schema";
import type { JsonSchema7Type } from "zod-to-json-schema";

export type JsonSchema = JSONSchema4Type | JsonSchema7Type;

export type JsonSchemaInput = {
  type: string;
  properties: Record<string, JsonSchema>;
  required: string[];
  $schema: string;
};

export type FunctionSchema<T extends z.ZodTypeAny | JsonSchemaInput> = {
  input: T;
};

export type FunctionRegistrationInput<
  T extends z.ZodTypeAny | JsonSchemaInput,
> = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  func: (input: FunctionInput<T>, context: ContextInput) => any;
  schema?: FunctionSchema<T>;
  config?: FunctionConfig;
  description?: string;
};

export type RegisteredService = {
  definition: {
    name: string;
  };

  /**
   * Registers a function against the service.
   * @param name Name of the function.
   * @param inputSchema Zod schema defining the function input.
   * @param func Function to be executed when the invoked is called.
   * @param config Configuration for the function call.
   * @example
   * ```ts
   * const d = new Inferable("API_SECRET");
   *
   * const service = d.service({
   *   name: "my-service",
   * });
   *
   * service.register("hello", z.object({name: z.string()}), async ({name}: {name: string}) => {
   *   return `Hello ${name}`;
   * });
   * ```
   */
  register: <T extends z.ZodTypeAny | JsonSchemaInput>(
    input: FunctionRegistrationInput<T>,
  ) => { service: string; function: string };
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export interface FunctionRegistration<
  T extends JsonSchemaInput | z.ZodTypeAny = any,
> {
  name: string;
  serviceName: string;
  description?: string;
  schema: {
    input: T;
    inputJson: string;
  };
  func: (args: FunctionInput<T>, context: ContextInput) => any;
  config?: FunctionConfig;
}
