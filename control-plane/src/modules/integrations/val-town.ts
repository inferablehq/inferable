import { z } from "zod";
import { getIntegrations } from "./integrations";
import { deleteServiceDefinition, upsertServiceDefinition } from "../service-definitions";
import { logger } from "../observability/logger";
import { acknowledgeJob, getJob, persistJobResult } from "../jobs/jobs";
import { packer } from "../packer";
import assert from "assert";
import { BadRequestError } from "../../utilities/errors";

// Schema for the /meta endpoint response
const ValTownMetaSchema = z.object({
  service: z.string(),
  endpoint: z.string().url(),
  description: z.string(),
  functions: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      input: z.object({
        type: z.literal("object"),
        properties: z.record(z.any()),
        required: z.array(z.string()).optional(),
      }),
    })
  ),
});

type ValTownMeta = z.infer<typeof ValTownMetaSchema>;

const valTownEndpointForCluster = async (clusterId: string) => {
  const integrations = await getIntegrations({ clusterId });
  return integrations.valTown?.endpoint;
};

/**
 * Fetch metadata from Val.town endpoint
 */
async function fetchValTownMeta({ endpoint }: { endpoint: string }): Promise<ValTownMeta> {
  const metaUrl = new URL("/meta", endpoint).toString();
  const response = await fetch(metaUrl);

  if (!response.ok) {
    logger.error("Failed to fetch Val.town metadata", {
      endpoint,
      status: response.status,
      statusText: response.statusText,
    });

    throw new BadRequestError("Failed to fetch Val.town metadata");
  }

  const data = await response.json();
  return ValTownMetaSchema.parse(data);
}

const valTownMetaZ = z.object({
  service: z.string(),
  endpoint: z.string().url(),
  description: z.string(),
  functions: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      input: z.object({
        type: z.literal("object"),
        properties: z.record(z.any()),
        required: z.array(z.string()).optional(),
      }),
    })
  ),
});

/**
 * Execute a Val.town function
 */
async function executeValTownFunction({
  endpoint,
  functionName,
  params,
}: {
  endpoint: string;
  functionName: string;
  params: Record<string, unknown>;
}) {
  const execUrl = new URL(`/exec/functions/${functionName}`, endpoint).toString();

  console.log("EXEC URL", execUrl);
  console.log("PARAMS", params);

  const response = await fetch(execUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || "Failed to execute Val.town function");
  }

  const data = await response.json();

  return data;
}

const syncValTownService = async ({
  clusterId,
  endpoint,
}: {
  clusterId: string;
  endpoint?: string;
}) => {
  logger.info("Syncing Val.town", { clusterId });

  if (!endpoint) {
    throw new BadRequestError("Missing Val.town configuration");
  }

  const meta = await fetchValTownMeta({ endpoint });

  await upsertServiceDefinition({
    type: "permanent",
    service: "valTown",
    definition: {
      name: "valTown",
      description: meta.description,
      functions: meta.functions.map(fn => ({
        name: fn.name,
        description: fn.description,
        schema: JSON.stringify(fn.input),
      })),
    },
    owner: { clusterId },
  });
};

const unsyncValTownService = async ({ clusterId }: { clusterId: string }) => {
  await deleteServiceDefinition({
    service: "valTown",
    owner: { clusterId },
  });
};

const handleCall = async ({
  call,
  clusterId,
}: {
  call: NonNullable<Awaited<ReturnType<typeof getJob>>>;
  clusterId: string;
}) => {
  await acknowledgeJob({
    jobId: call.id,
    clusterId,
    machineId: "VALTOWN",
  });

  const endpoint = await valTownEndpointForCluster(clusterId);

  if (!endpoint) {
    logger.error("Missing Val.town configuration", { clusterId });
    return;
  }

  try {
    const result = await executeValTownFunction({
      endpoint,
      functionName: call.targetFn,
      params: packer.unpack(call.targetArgs),
    });

    await persistJobResult({
      result: packer.pack(result),
      resultType: "resolution",
      jobId: call.id,
      owner: {
        clusterId,
      },
      machineId: "VALTOWN",
    });
  } catch (error) {
    await persistJobResult({
      result: packer.pack(error),
      resultType: "rejection",
      jobId: call.id,
      owner: {
        clusterId,
      },
      machineId: "VALTOWN",
    });
  }
};

export const valTown = {
  name: "ValTown",
  onActivate: async (clusterId: string) => {
    const config = await getIntegrations({ clusterId });
    await syncValTownService({
      clusterId,
      endpoint: config.valTown?.endpoint,
    });
  },
  onDeactivate: async (clusterId: string) => {
    await unsyncValTownService({ clusterId });
  },
  handleCall,
};
