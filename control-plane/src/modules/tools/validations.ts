
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { JSONSchema4Type } from "json-schema";
import type { JsonSchema7Type } from "zod-to-json-schema";
import { logger } from "../observability/logger";
import { z } from "zod";

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

export function validateToolName(name: string) {
  if (!name) {
    throw new Error("Tool name is required");
  }

  // must be 30 characters or less
  if (name.length > 30) {
    throw new Error("Tool name must be 50 characters or less");
  }

  // allows alphanumeric, and dots
  if (!/^[a-zA-Z0-9.]+$/.test(name)) {
    throw new Error(`Tool name must be alphanumeric and can contain dots, got ${name}`);
  }
}

export const validatePropertyName = (name: string) => {
  const ALLOWED_PROPERTY_NAME_CHARACTERS = /^[a-zA-Z0-9_]+$/;
  if (!ALLOWED_PROPERTY_NAME_CHARACTERS.test(name)) {
    throw new Error(
      `Property name must only contain letters, numbers and underscore '_'. Got: ${name}`,
    );
  }
};

export const validateToolDescription = (description?: string) => {
  if (description === "") {
    throw new Error("Tool description must not be empty");
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
