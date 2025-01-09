import { Validator, ValidatorResult } from "jsonschema";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import { logger } from "../../observability/logger";
import crypto from "crypto";

const validator = new Validator();

export class AgentToolInputError extends Error {
  validatorResult: ValidatorResult;

  constructor(validatorResult: ValidatorResult) {
    super(validatorResult.errors.map(e => e.stack).join("\n"));
    this.validatorResult = validatorResult;
  }
}

export class AgentTool {
  name: string;
  description: string;
  func: (input: unknown) => Promise<string | undefined>;
  schema?: string;

  constructor({
    name,
    description,
    func,
    schema,
  }: {
    name: string;
    description: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    func: (input: any) => Promise<string | undefined>;
    schema?: string | z.ZodObject<any>;
  }) {
    if (!!schema && typeof schema !== "string") {
      schema = JSON.stringify(zodToJsonSchema(schema));
    }

    this.name = name;
    this.description = description;
    this.func = func;
    this.schema = schema;
  }

  private validate(input: unknown): ValidatorResult {
    const result = validator.validate(input, JSON.parse(this.schema ?? "{}"));
    return result;
  }

  public execute(input: unknown): Promise<string | undefined> {
    const result = this.validate(input);
    if (result.valid) {
      return this.func(input);
    } else {
      throw new AgentToolInputError(result);
    }
  }
}

export class AgentToolV2 {
  name: string;
  description: string;
  func: (input: unknown) => Promise<unknown>;
  schema?: string;

  constructor({
    name,
    description,
    func,
    schema,
  }: {
    name: string;
    description: string;
    func: (input: any) => Promise<unknown>;
    schema?: string | z.ZodObject<any>;
  }) {
    if (!!schema && typeof schema !== "string") {
      schema = JSON.stringify(zodToJsonSchema(schema));
    }

    this.name = name;
    this.description = description;
    this.func = func;
    this.schema = schema;
  }

  public async execute(input: unknown): Promise<string> {
    try {
      return JSON.stringify({
        result: await this.func(input),
        resultType: "resolution",
        status: "success",
      });
    } catch (error) {
      const traceId = crypto.randomUUID();

      logger.info("Tool execution failed", {
        error,
        input,
        traceId,
      });

      return JSON.stringify({
        result: {
          error: error instanceof Error ? error : "Unknown error",
          message: error instanceof Error ? error.message : "Unknown",
          traceId,
        },
        resultType: "rejection",
        status: "success",
      });
    }
  }
}
