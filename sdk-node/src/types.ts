import { z } from "zod";
import { ToolConfigSchema } from "./contract";

/**
 * Context object which is passed to function calls
 */
export type ContextInput = {
  authContext?: unknown;
  runContext?: unknown;
  approved: boolean;
};

export type ToolConfig = z.infer<typeof ToolConfigSchema>;

export type ToolInput<T extends z.ZodTypeAny | JsonSchemaInput> =
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

export type ToolSchema<T extends z.ZodTypeAny | JsonSchemaInput> = {
  input: T;
};

export type ToolRegistrationInput<
  T extends z.ZodTypeAny | JsonSchemaInput,
> = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  func: (input: ToolInput<T>, context: ContextInput) => any;
  schema?: ToolSchema<T>;
  config?: ToolConfig;
  description?: string;
};
