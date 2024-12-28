import assert from "assert";
import { z } from "zod";
import { BadRequestError } from "../../utilities/errors";
import { acknowledgeJob, getJob, persistJobResult } from "../jobs/jobs";
import { logger } from "../observability/logger";
import { packer } from "../packer";
import { deleteServiceDefinition, upsertServiceDefinition } from "../service-definitions";
import { integrationSchema } from "./schema";
import { InstallableIntegration } from "./types";

// Schema for the /meta endpoint response
const valtownMetaSchema = z.object({
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

type ValTownMeta = z.infer<typeof valtownMetaSchema>;

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
  return valtownMetaSchema.parse(data);
}

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
  assert(endpoint, "Missing Val.town configuration");

  const meta = await fetchValTownMeta({ endpoint });

  await upsertServiceDefinition({
    type: "permanent",
    service: "valtown",
    definition: {
      name: "valtown",
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

const unsyncValTownService = async ({
  clusterId,
  integrations,
}: {
  clusterId: string;
  integrations: z.infer<typeof integrationSchema>;
}) => {
  assert(integrations.valtown, "Missing valtown configuration");

  await deleteServiceDefinition({
    service: "valtown",
    owner: { clusterId },
  });
};

const handleCall = async (
  call: NonNullable<Awaited<ReturnType<typeof getJob>>>,
  integrations: z.infer<typeof integrationSchema>
) => {
  await acknowledgeJob({
    jobId: call.id,
    clusterId: call.clusterId,
    machineId: "VALTOWN",
  });

  assert(integrations.valtown, "Missing valtown configuration");

  const endpoint = integrations.valtown.endpoint;

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
        clusterId: call.clusterId,
      },
      machineId: "VALTOWN",
    });
  } catch (error) {
    await persistJobResult({
      result: packer.pack(error),
      resultType: "rejection",
      jobId: call.id,
      owner: {
        clusterId: call.clusterId,
      },
      machineId: "VALTOWN",
    });
  }
};

export const valtown: InstallableIntegration = {
  name: "valtown",
  onActivate: async (clusterId: string, integrations: z.infer<typeof integrationSchema>) => {
    const config = integrations.valtown;

    assert(config, "Missing valtown configuration");

    await syncValTownService({
      clusterId,
      endpoint: config.endpoint,
    });
  },
  onDeactivate: async (clusterId: string, integrations: z.infer<typeof integrationSchema>) => {
    await unsyncValTownService({ clusterId, integrations });
  },
  handleCall,
};
