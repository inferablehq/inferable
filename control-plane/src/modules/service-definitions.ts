import { and, eq, lte, sql } from "drizzle-orm";
import {
  validateDescription,
  validateFunctionName,
  validateFunctionSchema,
  validateServiceName,
} from "inferable";
import { Validator } from "jsonschema";
import { z } from "zod";
import { InvalidJobArgumentsError, InvalidServiceRegistrationError } from "../utilities/errors";
import { FunctionConfigSchema } from "./contract";
import * as cron from "./cron";
import * as data from "./data";
import { embeddableEntitiy } from "./embeddings/embeddings";
import { logger } from "./observability/logger";
import { packer } from "./packer";
import { withThrottle } from "./util";
import jsonpath from "jsonpath";
import { stdlib } from "./runs/agent/tools/stdlib";

// The time without a ping before a service is considered expired
const SERVICE_LIVE_THRESHOLD_MS = 60 * 1000; // 1 minute

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
        })
      )
      .optional(),
  })
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
  const result = await data.db
    .update(data.services)
    .set({
      timestamp: new Date(),
    })
    .where(and(eq(data.services.cluster_id, clusterId), eq(data.services.service, service)))
    .returning({
      service: data.services.service,
    });

  if (result.length === 0) {
    return false;
  }

  return true;
}

export async function deleteServiceDefinition({
  service,
  owner,
}: {
  service: string;
  owner: { clusterId: string };
}) {
  await data.db
    .delete(data.services)
    .where(and(eq(data.services.cluster_id, owner.clusterId), eq(data.services.service, service)));

  await deleteServiceEmbeddings({
    serviceName: service,
    clusterId: owner.clusterId,
  });
}

export async function upsertServiceDefinition({
  service,
  definition,
  owner,
  type = "ephemeral",
}: {
  service: string;
  definition: ServiceDefinition;
  owner: { clusterId: string };
  type?: "ephemeral" | "permanent";
}) {
  validateServiceRegistration({
    service,
    definition,
  });

  // In order to prevent the service from being deleted by the cleanup job,
  // we set the timestamp to a future date if the service is permanent
  const timestamp = type === "permanent" ? sql`now() + interval '10 years'` : new Date();

  await data.db
    .insert(data.services)
    .values({
      service,
      definition,
      cluster_id: owner.clusterId,
      timestamp,
    })
    .onConflictDoUpdate({
      target: [data.services.service, data.services.cluster_id],
      set: {
        definition,
        timestamp,
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
    .where(and(eq(data.services.cluster_id, owner.clusterId), eq(data.services.service, service)))
    .limit(1);

  return serviceDefinition ? parseServiceDefinition([serviceDefinition.definition])[0] : undefined;
};

export const getServiceDefinitions = async (owner: {
  clusterId: string;
}): Promise<
  {
    service: string;
    definition: ServiceDefinition;
    timestamp: Date | null;
  }[]
> => {
  const serviceDefinitions = await data.db
    .select({
      service: data.services.service,
      definition: data.services.definition,
      timestamp: data.services.timestamp,
    })
    .from(data.services)
    .where(eq(data.services.cluster_id, owner.clusterId));

  logger.debug("Found serviceDefinitions", {
    serviceDefinitions,
  });

  if (serviceDefinitions.length === 0) {
    return [];
  }

  return serviceDefinitions.map(r => ({
    service: r.service,
    definition: parseServiceDefinition([r.definition])[0],
    timestamp: r.timestamp,
  }));
};

export const parseServiceDefinition = (input: unknown[]): ServiceDefinition[] => {
  if (!input || input.filter(i => i).length === 0) {
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
    .where(lte(data.services.timestamp, new Date(Date.now() - SERVICE_LIVE_THRESHOLD_MS)))
    .limit(10);

  // TODO: change query to bulk delete
  await Promise.all([
    ...serviceDefinitions.map(({ clusterId, service }) =>
      deleteServiceEmbeddings({ serviceName: service, clusterId })
    ),
    ...serviceDefinitions.map(({ clusterId, service }) =>
      data.db
        .delete(data.services)
        .where(and(eq(data.services.cluster_id, clusterId), eq(data.services.service, service)))
    ),
  ]);

  serviceDefinitions.forEach(s => {
    logger.info("Cleaned up expired service definition", {
      clusterId: s.clusterId,
      service: s.service,
    });
  });

  if (serviceDefinitions.length > 0) {
    // TODO: run this until all services are cleaned up
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

  await embeddableServiceFunction.deleteEmbeddings(clusterId, "service-function", serviceName);
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
    service.name
  );

  const embeddableFunctions =
    service.functions
      ?.filter(f => !f.config?.private)
      .map(f => ({
        serviceName: service.name,
        functionName: f.name,
        description: f.description,
        schema: f.schema,
      })) ?? [];

  await Promise.all(
    embeddableFunctions.map(fn =>
      embeddableServiceFunction.embedEntity(
        clusterId,
        "service-function",
        service.name,
        serviceFunctionEmbeddingId(fn),
        fn
      )
    )
  );

  // Find any embeddings for the group which no longer exist on the service
  const removedEmbeddings = existingEmbeddings
    .filter(e => !embeddableFunctions.some(f => serviceFunctionEmbeddingId(f) === e.id))
    .map(e => e.id);

  await Promise.all(
    removedEmbeddings.map(id =>
      embeddableServiceFunction.deleteEmbedding(clusterId, "service-function", id)
    )
  );
};

export const getStandardLibraryToolsMeta = (): {
  name: string;
  description: string;
  enabled: boolean;
}[] => {
  return Object.values(stdlib).map(tool => ({
    name: tool.name,
    description: tool.description,
    enabled: true,
  }));
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
    throw new InvalidServiceRegistrationError(error?.message ?? "Invalid service definition");
  }

  for (const fn of definition.functions ?? []) {
    if (fn.schema) {
      const errors = validateFunctionSchema(JSON.parse(fn.schema));
      if (errors.length > 0) {
        throw new InvalidServiceRegistrationError(
          `${fn.name} schema invalid: ${JSON.stringify(errors)}`
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
        );
      }
    }
  }
};

export const start = () =>
  cron.registerCron(cleanExpiredServiceDefinitions, "clean-service-definitions", {
    interval: 1000 * 10,
  }); // 10 seconds

export const normalizeFunctionReference = (fn: string | { service: string; function: string }) =>
  typeof fn === "object"
    ? serviceFunctionEmbeddingId({
        serviceName: fn.service,
        functionName: fn.function,
      })
    : fn;
