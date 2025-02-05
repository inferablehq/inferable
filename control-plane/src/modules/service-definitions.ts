import { and, eq, like, lte, sql } from "drizzle-orm";
import { validateDescription, validateFunctionName, validateFunctionSchema } from "./json-schema";
import { Validator } from "jsonschema";
import { InvalidJobArgumentsError } from "../utilities/errors";
import { logger } from "./observability/logger";
import { packer } from "./packer";

const validator = new Validator();

export const parseJobArgs = async ({
  schema,
  args,
}: {
  schema?: string;
  args: string;
}): Promise<object> => {
  try {
    args = packer.unpack(args);
  } catch {
    logger.error("Could not unpack arguments", {
      args,
    });
    throw new InvalidJobArgumentsError("Could not unpack arguments");
  }

  if (typeof args !== "object" || Array.isArray(args) || args === null) {
    logger.error("Invalid job arguments", {
      args,
    });
    throw new InvalidJobArgumentsError("Argument must be an object");
  }

  if (!schema) {
    logger.error("No schema found for job arguments", {
      args,
      schema,
    });

    throw new InvalidJobArgumentsError("No schema found for job arguments");
  }

  const result = validator.validate(args, JSON.parse(schema));

  if (result.errors.length) {
    throw new InvalidJobArgumentsError(result.errors.join(", "));
  }

  return args;
};
