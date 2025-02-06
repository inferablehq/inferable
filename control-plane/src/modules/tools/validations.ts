
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { JSONSchema4Type } from "json-schema";
import type { JsonSchema7Type } from "zod-to-json-schema";
import { logger } from "../observability/logger";
import { z } from "zod";
import { InvalidServiceRegistrationError } from "../../utilities/errors";

type ValidationError = {
  path: string;
  error: string;
};

export type JsonSchema = JSONSchema4Type | JsonSchema7Type;

export type JsonSchemaInput = {
  type: string;
  properties: Record<string, JsonSchema>;
  required: string[];
  $schema: string;
};

export function validateToolName(name: string, isPrivate: boolean) {
  if (!name) {
    throw new InvalidServiceRegistrationError("Tool name is required");
  }

  // must be 50 characters or less
  if (name.length > 50) {
    throw new InvalidServiceRegistrationError("Tool name must be 50 characters or less");
  }

  logger.info("Validating tool name", {
    name,
    isPrivate,
  });

  // Private functions are less restrictive as they don't pass through the model
  if (isPrivate) {
    // private functions can have alphanumeric, hyphen, underscore and period
    // The inclusion of period is to support workflow handlers
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      throw new InvalidServiceRegistrationError(`Private Tools can have alphanumeric, hyphen, underscore and period, got ${name}`);
    }
  } else {
    // public functions can have alphanumeric, hyphen, underscore
    // https://docs.anthropic.com/en/docs/build-with-claude/tool-use
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new InvalidServiceRegistrationError(`Tools can have alphanumeric, hyphen and underscore got ${name}`);
    }
  }
}

export const validatePropertyName = (name: string) => {
  const ALLOWED_PROPERTY_NAME_CHARACTERS = /^[a-zA-Z0-9_]+$/;
  if (!ALLOWED_PROPERTY_NAME_CHARACTERS.test(name)) {
    throw new InvalidServiceRegistrationError(
      `Property name must only contain letters, numbers and underscore '_'. Got: ${name}`,
    );
  }
};

export const validateToolDescription = (description?: string) => {
  if (description === "") {
    throw new InvalidServiceRegistrationError("Tool description must not be empty");
  }
};

/*
 * Validate a function schema.
 */
export const validateToolSchema = (
  input: JsonSchemaInput,
): { path: string; error: string }[] => {
  delete input.properties?.undefined;

  if (!input || !input.properties) {
    return [{ path: "", error: "Schema must be defined" }];
  }

  const errors = Object.keys(input.properties)
    .map((key) => {
      return validateProperty(key, input.properties[key]);
    })
    .flat();

  if (errors.length > 0) {
    return errors;
  }

  const ajv = new Ajv();
  addFormats(ajv);

  try {
    ajv.compile({
      ...input,
      $schema: undefined,
    });
  } catch (error) {
    if (error instanceof Error) {
      return ajvErrorToFailures(error);
    }
    logger.error("Unknown JSON schema compilation error", { error });
    throw new Error("Unknown JSON schema compilation error");
  }

  return [];
};

/**
 * Recursively validate $.properties
 */
const validateProperty = (
  key: string,
  value: JsonSchema,
): ValidationError[] => {
  let errors: ValidationError[] = [];
  try {
    validatePropertyName(key);
  } catch (error) {
    if (error instanceof Error) {
      errors.push({
        path: `${key}`,
        error: error.message,
      });
    } else {
      throw error;
    }
  }
  if (value && typeof value === "object" && "properties" in value) {
    const properties = (value.properties as Record<string, JsonSchema>) || {};

    errors = errors.concat(
      Object.keys(properties)
        .map((key) => {
          return validateProperty(key, properties[key]);
        })
        .flat(),
    );
  }

  return errors;
};

/*
 * Accepts an AJV compilation error and extracts the error details from the message.
 */
export const ajvErrorToFailures = (
  error: Error,
): { path: string; error: string }[] => {
  // example: /data/properties/name some error message
  if (error.message.startsWith("schema is invalid:")) {
    return error.message
      .replace("schema is invalid:", "")
      .split(",")
      .map((s) => s.trim())
      .map((s) => {
        const firstSpace = s.indexOf(" ");

        if (firstSpace === -1) {
          throw new Error(
            "Could not extract failures from AJV error",
          );
        }

        return {
          path: s.slice(0, firstSpace),
          error: s.slice(firstSpace + 1),
        };
      });
  }

  return [
    {
      path: "",
      error: error.message,
    },
  ];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isZodType = (input: any): input is z.ZodTypeAny => {
  return input?._def?.typeName;
};
