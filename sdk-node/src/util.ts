import { InferableError } from "./errors";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { z } from "zod";
import { JsonSchemaInput, JsonSchema } from "./types";
import { blobSchema } from "./contract";

type ValidationError = {
  path: string;
  error: string;
};

// Name restriction for Services and Functions
const ALLOWED_NAME_CHARACTERS = /^[a-zA-Z0-9]+$/;
const MAX_NAME_LENGTH = 30;

export const validateFunctionArgs = (schema: any, args: unknown) => {
  try {
    if (isZodType(schema)) {
      schema.parse(args);
    } else {
      const ajv = new Ajv();

      addFormats(ajv);
      ajv.compile({
        ...schema,
        $schema: undefined,
      });
      ajv.validate(schema, args);
    }
  } catch (e: unknown) {}
};

export const validateServiceName = (name: string) => {
  if (!ALLOWED_NAME_CHARACTERS.test(name)) {
    throw new InferableError(
      `Service name must only contain letters and numbers. Got: ${name}`,
    );
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new InferableError(
      `Service name must be less than ${MAX_NAME_LENGTH} characters: Got ${name} with length ${name.length}.`,
    );
  }
};

export const validateFunctionName = (name: string) => {
  if (!ALLOWED_NAME_CHARACTERS.test(name)) {
    throw new InferableError(
      `Function name must only contain letters and numbers. Got: ${name}`,
    );
  }
};

export const validatePropertyName = (name: string) => {
  const ALLOWED_PROPERTY_NAME_CHARACTERS = /^[a-zA-Z0-9_]+$/;
  if (!ALLOWED_PROPERTY_NAME_CHARACTERS.test(name)) {
    throw new InferableError(
      `Property name must only contain letters, numbers and underscore '_'. Got: ${name}`,
    );
  }
};

export const validateDescription = (description?: string) => {
  if (description === "") {
    throw new InferableError("Description must not be empty");
  }
};

/*
 * Validate a function schema.
 */
export const validateFunctionSchema = (
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
    throw new InferableError("Unknown JSON schema compilation error", {
      error,
    });
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
          throw new InferableError(
            "Could not extract failures from AJV error",
            {
              error,
            },
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

export const BLOB_DATA_KEY = "__inferable_blob_data";

export const extractBlobs = (
  content: unknown,
): { content: unknown; blobs: z.infer<typeof blobExtractionSchema>[] } => {
  if (!content || typeof content !== "object") {
    return {
      blobs: [],
      content,
    };
  }

  const keys = Object.keys(content);

  if (keys.length === 0) {
    return {
      blobs: [],
      content,
    };
  }

  const blobs: Record<string, z.infer<typeof blobExtractionSchema>> = {};

  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (content as any)[key];

    if (value && typeof value === "object" && BLOB_DATA_KEY in value) {
      const parsedBlob = blobExtractionSchema.safeParse(value[BLOB_DATA_KEY]);

      if (!parsedBlob.success) {
        console.error(parsedBlob.error);
        throw new InferableError("Found invalid Blob data");
      }

      blobs[key] = parsedBlob.data;
    }
  }

  return {
    blobs: Object.values(blobs),
    content: Object.fromEntries(
      Object.entries(content).filter(([key]) => !blobs[key]),
    ),
  };
};

const blobExtractionSchema = blobSchema
  .omit({
    id: true,
    createdAt: true,
    runId: true,
    jobId: true,
  })
  .and(
    z.object({
      data: z.string(),
    }),
  );

type BlobType = "application/json" | "image/png" | "image/jpeg";
export const blob = ({
  name,
  data,
  type,
}: {
  name: string;
  type: BlobType;
  data: Buffer | object;
}) => {
  if (!(data instanceof Buffer)) {
    if (type !== "application/json") {
      throw new InferableError("Object type must be application/json");
    }
    data = Buffer.from(JSON.stringify(data));
  }
  const encoded = data.toString("base64");

  return {
    [BLOB_DATA_KEY]: {
      name,
      type,
      encoding: "base64",
      data: encoded,
      size: Buffer.from(encoded).byteLength,
    },
  };
};

export const INTERRUPT_KEY = "__inferable_interrupt";
type VALID_INTERRUPT_TYPES = "approval" | "general";
const interruptResultSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("approval"),
  }),
]);

export const extractInterrupt = (
  input: unknown,
): z.infer<typeof interruptResultSchema> | undefined => {
  if (input && typeof input === "object" && INTERRUPT_KEY in input) {
    const parsedInterrupt = interruptResultSchema.safeParse(
      input[INTERRUPT_KEY],
    );

    if (!parsedInterrupt.success) {
      throw new InferableError("Found invalid Interrupt data");
    }

    return parsedInterrupt.data;
  }
};

export class Interrupt {
  [INTERRUPT_KEY]: {
    type: VALID_INTERRUPT_TYPES;
  };

  constructor(type: VALID_INTERRUPT_TYPES) {
    this[INTERRUPT_KEY] = {
      type,
    };
  }

  static approval() {
    return new Interrupt("approval");
  }

  static general() {
    return new Interrupt("general");
  }
}
