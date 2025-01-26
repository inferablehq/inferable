import Ajv from "ajv";
import addFormats from "ajv-formats";
import assert from "assert";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../utilities/errors";
import { RunMessageMetadata, db, agents } from "./data";
import { logger } from "./observability/logger";
import { VersionedEntity } from "./versioned-entities";
import { validateFunctionSchema } from "inferable";
import { JsonSchemaInput } from "inferable/bin/types";
import { ChatIdentifiers } from "./models/routing";

export const versionedAgentConfig = new VersionedEntity(
  z.object({
    name: z.string(),
    initialPrompt: z.string().optional(),
    systemPrompt: z.string().nullable().optional(),
    attachedFunctions: z.array(z.string()),
    resultSchema: z.unknown().optional(),
    inputSchema: z.unknown().optional(),
  }),
  "prompt_template"
);

export async function upsertAgent({
  id,
  clusterId,
  name,
  initialPrompt,
  systemPrompt,
  attachedFunctions,
  resultSchema,
  inputSchema,
}: {
  id: string;
  clusterId: string;
  name?: string;
  initialPrompt?: string | null;
  systemPrompt?: string | null;
  resultSchema?: unknown | null;
  inputSchema?: unknown | null;
  attachedFunctions?: string[];
}) {
  const [existing] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.cluster_id, clusterId), eq(agents.id, id)))
    .limit(1);

  if (initialPrompt === "" || initialPrompt === undefined) {
    initialPrompt = null;
  }

  if (systemPrompt === "" || systemPrompt === undefined) {
    systemPrompt = null;
  }

  if (resultSchema === "" || resultSchema === undefined) {
    resultSchema = null;
  }

  if (inputSchema === "" || inputSchema === undefined) {
    inputSchema = null;
  }

  if (!name) {
    throw new BadRequestError("Missing required fields");
  }

  const [upserted] = await db
    .insert(agents)
    .values({
      id,
      cluster_id: clusterId,
      name,
      initial_prompt: initialPrompt,
      system_prompt: systemPrompt,
      attached_functions: attachedFunctions ?? [],
      result_schema: resultSchema,
      input_schema: inputSchema,
    })
    .onConflictDoUpdate({
      target: [agents.id, agents.cluster_id],
      set: {
        name,
        initial_prompt: initialPrompt,
        system_prompt: systemPrompt,
        attached_functions: attachedFunctions,
        result_schema: resultSchema,
        input_schema: inputSchema,
        updated_at: new Date(),
      },
    })
    .returning({
      id: agents.id,
      clusterId: agents.cluster_id,
      name: agents.name,
      initialPrompt: agents.initial_prompt,
      systemPrompt: agents.system_prompt,
      attachedFunctions: agents.attached_functions,
      resultSchema: agents.result_schema,
      inputSchema: agents.input_schema,
      createdAt: agents.created_at,
      updatedAt: agents.updated_at,
    });

  assert(upserted?.id, "Failed to create or update run configuration");

  if (existing) {
    await versionedAgentConfig.create(clusterId, id, {
      name: existing.name,
      initialPrompt: existing.initial_prompt ?? undefined,
      systemPrompt: existing.system_prompt,
      attachedFunctions: existing.attached_functions,
      resultSchema: existing.result_schema,
      inputSchema: existing.input_schema,
    });
  }

  return upserted;
}

export async function getAgent({
  clusterId,
  id,
  withPreviousVersions = false,
}: {
  clusterId: string;
  id: string;
  withPreviousVersions?: boolean;
}) {
  const [template] = await db
    .select({
      id: agents.id,
      name: agents.name,
      initialPrompt: agents.initial_prompt,
      systemPrompt: agents.system_prompt,
      attachedFunctions: agents.attached_functions,
      resultSchema: agents.result_schema,
      inputSchema: agents.input_schema,
      createdAt: agents.created_at,
      updatedAt: agents.updated_at,
      clusterId: agents.cluster_id,
    })
    .from(agents)
    .where(and(eq(agents.cluster_id, clusterId), eq(agents.id, id)));

  if (!template) {
    throw new NotFoundError("Prompt template not found");
  }

  const versions = withPreviousVersions ? await versionedAgentConfig.get(clusterId, id) : [];

  return {
    ...template,
    resultSchema: template.resultSchema as any,
    inputSchema: template.inputSchema as any,
    versions: versions.map(v => ({
      version: v.version,
      name: v.entity.name,
      initialPrompt: v.entity.initialPrompt ?? null,
      systemPrompt: v.entity.systemPrompt ?? null,
      attachedFunctions: v.entity.attachedFunctions,
      resultSchema: v.entity.resultSchema as any,
      inputSchema: v.entity.inputSchema as any,
    })),
  };
}

export async function deleteAgent({ clusterId, id }: { clusterId: string; id: string }) {
  const [deleted] = await db
    .delete(agents)
    .where(and(eq(agents.cluster_id, clusterId), eq(agents.id, id)))
    .returning({
      id: agents.id,
    });

  if (!deleted) {
    throw new NotFoundError("Prompt template not found");
  }
}

export async function listAgents({ clusterId }: { clusterId: string }) {
  return db
    .select({
      id: agents.id,
      name: agents.name,
      initialPrompt: agents.initial_prompt,
      systemPrompt: agents.system_prompt,
      attachedFunctions: agents.attached_functions,
      resultSchema: agents.result_schema,
      createdAt: agents.created_at,
      updatedAt: agents.updated_at,
      clusterId: agents.cluster_id,
    })
    .from(agents)
    .where(eq(agents.cluster_id, clusterId));
}

export const validateSchema = ({ schema, name }: { schema: any; name: string }) => {
  try {
    const resultSchemaErrors = validateFunctionSchema(schema as JsonSchemaInput);

    if (resultSchemaErrors.length > 0) {
      return {
        status: 400 as const,
        body: {
          message: `'${name}' is not a valid JSON Schema`,
          errors: resultSchemaErrors,
        },
      };
    }
  } catch (error) {
    logger.warn(`Failed to validate '${name}'`, {
      error,
    });
    return {
      status: 400 as const,
      body: {
        message: `Failed to validate '${name}'`,
      },
    };
  }
};

export const validateInput = ({ schema, input }: { schema: any; input: any }) => {
  try {
    const ajv = new Ajv();

    addFormats(ajv);
    ajv.compile({
      ...schema,
      $schema: undefined,
    });
    ajv.validate(schema, input);
    if (ajv.errors?.length) {
      return {
        status: 400 as const,
        body: {
          message: "Could not validate run input",
          errors: ajv.errors,
        },
      };
    }
  } catch (error) {
    logger.warn("Could not validate run input", {
      error,
    });
    return {
      status: 400 as const,
      body: {
        message: "Could not validate run input",
      },
    };
  }
};

export type RunOptions = {
  id?: string;
  initialPrompt?: string;
  systemPrompt?: string;
  attachedFunctions?: string[];
  resultSchema?: unknown;

  interactive?: boolean;
  reasoningTraces?: boolean;
  callSummarization?: boolean;
  modelIdentifier?: ChatIdentifiers;
  enableResultGrounding?: boolean;

  input?: Record<string, unknown>;
  messageMetadata?: RunMessageMetadata;
};

type Agent = Awaited<ReturnType<typeof getAgent>>;

export const mergeAgentOptions = (options: RunOptions, agent: Agent) => {
  const mergedOptions: RunOptions = {
    initialPrompt: agent.initialPrompt ?? options.initialPrompt,
    systemPrompt: agent.systemPrompt ?? options.systemPrompt,
    attachedFunctions: agent.attachedFunctions ?? options.attachedFunctions,
    resultSchema: agent.resultSchema ?? options.resultSchema,

    interactive: options.interactive,
    reasoningTraces: options.reasoningTraces,
    callSummarization: options.callSummarization,
    modelIdentifier: options.modelIdentifier,
    enableResultGrounding: options.enableResultGrounding,
    input: options.input,
  };

  if (agent.inputSchema) {
    if (!options.input) {
      return {
        options: null,
        error: {
          status: 400 as const,
          body: {
            message: "Agent requires input object",
          },
        },
      };
    }

    const validationError = validateInput({
      schema: agent.inputSchema,
      input: options.input,
    });

    if (validationError) {
      return {
        options: null,
        error: validationError,
      };
    }
  }

  return {
    options: mergedOptions,
    error: null,
  };
};
