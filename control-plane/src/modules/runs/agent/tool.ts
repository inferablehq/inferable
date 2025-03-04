import { Validator, ValidatorResult } from "jsonschema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const validator = new Validator();

export class AgentToolInputError extends Error {
  validatorResult: ValidatorResult;

  constructor(validatorResult: ValidatorResult) {
    super(validatorResult.errors.map((e) => e.stack).join("\n"));
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

  public get metadata(): {
    name: string;
    description: string;
    schema: string;
  } {
    return {
      name: this.name,
      description: this.description,
      schema: this.schema ?? "{}",
    };
  }
}
