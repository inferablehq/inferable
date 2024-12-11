import { and, eq, lte } from "drizzle-orm";
import {
  validateDescription,
  validateFunctionName,
  validateFunctionSchema,
  validateServiceName,
} from "inferable";
import jsonSchemaToZod, { JsonSchema } from "json-schema-to-zod";
import { Validator } from "jsonschema";
import { z } from "zod";
import {
  InvalidJobArgumentsError,
  InvalidServiceRegistrationError,
} from "../utilities/errors";
import { FunctionConfigSchema } from "./contract";
import * as cron from "./cron";
import * as data from "./data";
import { embeddableEntitiy } from "./embeddings/embeddings";
import { logger } from "./observability/logger";
import { packer } from "./packer";
import { withThrottle } from "./util";
import jsonpath from "jsonpath";

// The time without a ping before a service is considered expired
const SERVICE_LIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export type FunctionConfig = z.infer<typeof FunctionConfigSchema>;

export type ServiceDefinition = {
  name: string;
  description?: string;
  functions?: Array<ServiceDefinitionFunction>;
};

export type ServiceDefinitionFunction = {
  name: string;
  description?: string;
  schema?: string;
  config?: FunctionConfig;
};

export const storedServiceDefinitionSchema = z.array(
  z.object({
    name: z.string(),
    description: z.string().optional(),
    functions: z
      .array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          schema: z.string().optional(),
          config: FunctionConfigSchema.optional(),
        }),
      )
      .optional(),
  }),
);

export const embeddableServiceFunction = embeddableEntitiy<{
  serviceName: string;
  functionName: string;
  description?: string;
  schema?: string;
}>();

export async function recordServicePoll({
  clusterId,
  service,
}: {
  clusterId: string;
  service: string;
}) {
  // As we call this on each poll, limit the number of updates that reach the database
  return withThrottle(
    `clusters:${clusterId}:services:${service}:throttle`,
    60,
    async () => {
      const result = await data.db
        .update(data.services)
        .set({
          timestamp: new Date(),
        })
        .where(
          and(
            eq(data.services.cluster_id, clusterId),
            eq(data.services.service, service),
          ),
        )
        .returning({
          service: data.services.service,
        });

      if (result.length === 0) {
        return false;
      }

      return true;
    },
  );
}

export async function upsertServiceDefinition({
  service,
  definition,
  owner,
}: {
  service: string;
  definition: ServiceDefinition;
  owner: { clusterId: string };
}) {
  validateServiceRegistration({
    service,
    definition,
  });
  await data.db
    .insert(data.services)
    .values({
      service,
      definition,
      cluster_id: owner.clusterId,
      timestamp: new Date(),
    })
    .onConflictDoUpdate({
      target: [data.services.service, data.services.cluster_id],
      set: {
        definition,
        timestamp: new Date(),
      },
    });

  await updateServiceEmbeddings({
    service: definition,
    clusterId: owner.clusterId,
  });
}

export const getServiceDefinition = async ({
  owner,
  service,
}: {
  owner: {
    clusterId: string;
  };
  service: string;
}) => {
  const [serviceDefinition] = await data.db
    .select({
      definition: data.services.definition,
    })
    .from(data.services)
    .where(
      and(
        eq(data.services.cluster_id, owner.clusterId),
        eq(data.services.service, service),
      ),
    )
    .limit(1);

  return serviceDefinition
    ? parseServiceDefinition([serviceDefinition.definition])[0]
    : undefined;
};

export const getServiceDefinitions = async (owner: {
  clusterId: string;
}): Promise<ServiceDefinition[]> => {
  const serviceDefinitions = await data.db
    .select({
      definition: data.services.definition,
    })
    .from(data.services)
    .where(eq(data.services.cluster_id, owner.clusterId));

  logger.debug("Found serviceDefinitions", {
    serviceDefinitions,
  });

  if (serviceDefinitions.length === 0) {
    return [];
  }

  const retrieved = parseServiceDefinition(
    serviceDefinitions.map((d) => d.definition),
  );

  return retrieved;
};

export const parseServiceDefinition = (
  input: unknown[],
): ServiceDefinition[] => {
  if (!input || input.filter((i) => i).length === 0) {
    return [];
  }

  return input ? storedServiceDefinitionSchema.parse(input) : [];
};

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

export const serviceFunctionEmbeddingId = ({
  serviceName,
  functionName,
}: {
  serviceName: string;
  functionName: string;
}) => `${serviceName}_${functionName}`;

export const cleanExpiredServiceDefinitions = async (): Promise<void> => {
  const serviceDefinitions = await data.db
    .select({
      clusterId: data.services.cluster_id,
      service: data.services.service,
    })
    .from(data.services)
    .where(
      lte(
        data.services.timestamp,
        new Date(Date.now() - SERVICE_LIVE_THRESHOLD_MS),
      ),
    )
    .limit(10);

  // TODO: change query to bulk delete
  await Promise.all([
    ...serviceDefinitions.map(({ clusterId, service }) =>
      deleteServiceEmbeddings({ serviceName: service, clusterId }),
    ),
    ...serviceDefinitions.map(({ clusterId, service }) =>
      data.db
        .delete(data.services)
        .where(
          and(
            eq(data.services.cluster_id, clusterId),
            eq(data.services.service, service),
          ),
        ),
    ),
  ]);

  serviceDefinitions.forEach((s) => {
    logger.info("Cleaned up expired service definition", {
      clusterId: s.clusterId,
      service: s.service,
    });
  });

  if (serviceDefinitions.length === 10) {
    return cleanExpiredServiceDefinitions();
  }
};

const deleteServiceEmbeddings = async ({
  serviceName,
  clusterId,
}: {
  serviceName: string;
  clusterId: string;
}) => {
  logger.info("Removing embeddings", {
    serviceName,
    clusterId,
  });

  await embeddableServiceFunction.deleteEmbeddings(
    clusterId,
    "service-function",
    serviceName,
  );
};

/**
 * Embed a Service definition, cleaning up any removed functions.
 * In the future this can be moved to a background task.
 */
export const updateServiceEmbeddings = async ({
  service,
  clusterId,
}: {
  service: ServiceDefinition;
  clusterId: string;
}) => {
  const existingEmbeddings = await embeddableServiceFunction.getEmbeddingsGroup(
    clusterId,
    "service-function",
    service.name,
  );

  const embeddableFunctions =
    service.functions
      ?.filter((f) => !f.config?.private)
      .map((f) => ({
        serviceName: service.name,
        functionName: f.name,
        description: f.description,
        schema: f.schema,
      })) ?? [];

  await Promise.all(
    embeddableFunctions.map((fn) =>
      embeddableServiceFunction.embedEntity(
        clusterId,
        "service-function",
        service.name,
        serviceFunctionEmbeddingId(fn),
        fn,
      ),
    ),
  );

  // Find any embeddings for the group which no longer exist on the service
  const removedEmbeddings = existingEmbeddings
    .filter(
      (e) =>
        !embeddableFunctions.some(
          (f) => serviceFunctionEmbeddingId(f) === e.id,
        ),
    )
    .map((e) => e.id);

  await Promise.all(
    removedEmbeddings.map((id) =>
      embeddableServiceFunction.deleteEmbedding(
        clusterId,
        "service-function",
        id,
      ),
    ),
  );
};

export const validateServiceRegistration = ({
  service,
  definition,
}: {
  service: string;
  definition: ServiceDefinition;
}) => {
  try {
    validateServiceName(service);
    for (const fn of definition.functions ?? []) {
      validateFunctionName(fn.name);
      validateDescription(fn.description);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    throw new InvalidServiceRegistrationError(
      error?.message ?? "Invalid service definition",
    );
  }

  for (const fn of definition.functions ?? []) {
    if (fn.schema) {
      const errors = validateFunctionSchema(JSON.parse(fn.schema));
      if (errors.length > 0) {
        throw new InvalidServiceRegistrationError(
          `${fn.name} schema invalid: ${JSON.stringify(errors)}`,
        );
      }
    }

    if (fn.config?.cache) {
      try {
        jsonpath.parse(fn.config.cache.keyPath);
      } catch {
        throw new InvalidServiceRegistrationError(
          `${fn.name} cache.keyPath is invalid`,
          "https://docs.inferable.ai/pages/functions#config-cache"
        )
      }
    }

    // Checks for customer auth handler
    const VERIFY_FUNCTION_NAME = "handleCustomAuth";
    const VERIFY_FUNCTION_SERVICE = "default";
    if (service === VERIFY_FUNCTION_SERVICE && fn.name === VERIFY_FUNCTION_NAME) {
      if (!fn.schema) {
        throw new InvalidServiceRegistrationError(
          `${fn.name} must have a valid schema`,
          "https://docs.inferable.ai/pages/auth#handlecustomerauth"
        );
      }

      // Check that the schema accepts and expected value
      const zodSchema = deserializeFunctionSchema(fn.schema);
      const schema = zodSchema.safeParse({ token: "test" });
      if (!schema.success) {
        throw new InvalidServiceRegistrationError(
          `${fn.name} schema is not valid`,
          "https://docs.inferable.ai/pages/auth#handlecustomerauth"
        );
      }
    }
  }
};

export const start = () =>
  cron.registerCron(
    cleanExpiredServiceDefinitions,
    "clean-service-definitions",
    {
      interval: 1000 * 10,
    },
  ); // 10 seconds

/**
 * Convert a JSON schema (Object or String) to a Zod schema object
 */
export const deserializeFunctionSchema = (schema: unknown) => {
  if (typeof schema === "object") {
    let zodSchema;

    try {
      zodSchema = jsonSchemaToZod(schema as JsonSchema);
    } catch (e) {
      logger.error("Failed to convert schema to Zod", { schema, error: e });
      throw new Error("Failed to load the tool definition");
    }

    return eval(`
const { z } = require("zod");
${zodSchema}
`);
  } else if (typeof schema === "string") {
    let parsed;

    try {
      parsed = JSON.parse(schema);
    } catch (e) {
      logger.error("Failed to parse schema", { schema, error: e });
      throw new Error("Failed to parse the tool definition");
    }

    let zodSchema;

    try {
      zodSchema = jsonSchemaToZod(parsed);
    } catch (e) {
      logger.error("Failed to convert schema to Zod", { schema, error: e });
      throw new Error("Failed to load the tool definition");
    }

    return eval(`
const { z } = require("zod");
${zodSchema}
`);
  } else {
    logger.error("Invalid schema", { schema });
    throw new Error("Invalid schema");
  }
};

export const normalizeFunctionReference = (
  fn: string | { service: string; function: string },
) =>
  typeof fn === "object"
    ? serviceFunctionEmbeddingId({
        serviceName: fn.service,
        functionName: fn.function,
      })
    : fn;
