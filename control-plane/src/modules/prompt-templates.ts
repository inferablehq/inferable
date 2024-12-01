import Ajv from "ajv";
import addFormats from "ajv-formats";
import assert from "assert";
import { and, eq, inArray } from "drizzle-orm";
import { nullable, z } from "zod";
import { BadRequestError, NotFoundError } from "../utilities/errors";
import { RunMessageMetadata, db, promptTemplates } from "./data";
import { embeddableEntitiy } from "./embeddings/embeddings";
import { logger } from "./observability/logger";
import { VersionedEntity } from "./versioned-entities";
import { validateFunctionSchema } from "inferable";
import { JsonSchemaInput } from "inferable/bin/types";
import { ChatIdentifiers } from "./models/routing";

export const embeddableServiceFunction = embeddableEntitiy<{
  name: string;
  prompt: string;
}>();

export const versionedRunConfig = new VersionedEntity(
  z.object({
    name: z.string(),
    initialPrompt: z.string().optional(),
    systemPrompt: z.string().nullable().optional(),
    attachedFunctions: z.array(z.string()),
    resultSchema: z.unknown().optional(),
    inputSchema: z.unknown().optional(),
    public: z.boolean().optional(),
  }),
  "prompt_template",
);

export async function upsertRunConfig({
  id,
  clusterId,
  name,
  initialPrompt,
  systemPrompt,
  attachedFunctions,
  resultSchema,
  inputSchema,
  isPublic = false,
}: {
  id: string;
  clusterId: string;
  name?: string;
  initialPrompt?: string | null;
  systemPrompt?: string | null;
  resultSchema?: unknown | null;
  inputSchema?: unknown | null;
  attachedFunctions?: string[];
  isPublic?: boolean;
}) {
  const [existing] = await db
    .select()
    .from(promptTemplates)
    .where(
      and(
        eq(promptTemplates.cluster_id, clusterId),
        eq(promptTemplates.id, id),
      ),
    )
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
    .insert(promptTemplates)
    .values({
      id,
      cluster_id: clusterId,
      name,
      initial_prompt: initialPrompt,
      system_prompt: systemPrompt,
      attached_functions: attachedFunctions,
      result_schema: resultSchema,
      input_schema: inputSchema,
      public: isPublic,
    })
    .onConflictDoUpdate({
      target: [promptTemplates.id, promptTemplates.cluster_id],
      set: {
        name,
        initial_prompt: initialPrompt,
        system_prompt: systemPrompt,
        attached_functions: attachedFunctions,
        result_schema: resultSchema,
        input_schema: inputSchema,
        public: isPublic,
        updated_at: new Date(),
      },
    })
    .returning({
      id: promptTemplates.id,
      clusterId: promptTemplates.cluster_id,
      name: promptTemplates.name,
      initialPrompt: promptTemplates.initial_prompt,
      systemPrompt: promptTemplates.system_prompt,
      attachedFunctions: promptTemplates.attached_functions,
      resultSchema: promptTemplates.result_schema,
      inputSchema: promptTemplates.input_schema,
      public: promptTemplates.public,
      createdAt: promptTemplates.created_at,
      updatedAt: promptTemplates.updated_at,
    });

  assert(upserted?.id, "Failed to create or update run configuration");

  if (existing) {
    await versionedRunConfig.create(clusterId, id, {
      name: existing.name,
      initialPrompt: existing.initial_prompt ?? undefined,
      systemPrompt: existing.system_prompt,
      attachedFunctions: existing.attached_functions,
      resultSchema: existing.result_schema,
      inputSchema: existing.input_schema,
      public: existing.public,
    });
  }

  await embeddableServiceFunction.embedEntity(
    clusterId,
    "prompt-template",
    "global",
    upserted.id,
    {
      name: upserted.name,
      prompt: upserted.initialPrompt ?? name,
    },
  );

  return upserted;
}

export async function getRunConfig({
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
      id: promptTemplates.id,
      name: promptTemplates.name,
      initialPrompt: promptTemplates.initial_prompt,
      systemPrompt: promptTemplates.system_prompt,
      attachedFunctions: promptTemplates.attached_functions,
      resultSchema: promptTemplates.result_schema,
      inputSchema: promptTemplates.input_schema,
      public: promptTemplates.public,
      createdAt: promptTemplates.created_at,
      updatedAt: promptTemplates.updated_at,
      clusterId: promptTemplates.cluster_id,
    })
    .from(promptTemplates)
    .where(
      and(
        eq(promptTemplates.cluster_id, clusterId),
        eq(promptTemplates.id, id),
      ),
    );

  if (!template) {
    throw new NotFoundError("Prompt template not found");
  }

  const versions = withPreviousVersions
    ? await versionedRunConfig.get(clusterId, id)
    : [];

  return {
    ...template,
    resultSchema: template.resultSchema as any,
    inputSchema: template.inputSchema as any,
    versions: versions.map((v) => ({
      version: v.version,
      name: v.entity.name,
      initialPrompt: v.entity.initialPrompt ?? null,
      systemPrompt: v.entity.systemPrompt ?? null,
      attachedFunctions: v.entity.attachedFunctions,
      resultSchema: v.entity.resultSchema as any,
      inputSchema: v.entity.inputSchema as any,
      public: v.entity.public ?? false,
    })),
  };
}

export async function deleteRunConfig({
  clusterId,
  id,
}: {
  clusterId: string;
  id: string;
}) {
  const [deleted] = await db
    .delete(promptTemplates)
    .where(
      and(
        eq(promptTemplates.cluster_id, clusterId),
        eq(promptTemplates.id, id),
      ),
    )
    .returning({
      id: promptTemplates.id,
    });

  await embeddableServiceFunction.deleteEmbedding(
    clusterId,
    "prompt-template",
    id,
  );

  if (!deleted) {
    throw new NotFoundError("Prompt template not found");
  }
}

export async function listRunConfigs({ clusterId }: { clusterId: string }) {
  return db
    .select({
      id: promptTemplates.id,
      name: promptTemplates.name,
      initialPrompt: promptTemplates.initial_prompt,
      systemPrompt: promptTemplates.system_prompt,
      attachedFunctions: promptTemplates.attached_functions,
      resultSchema: promptTemplates.result_schema,
      createdAt: promptTemplates.created_at,
      updatedAt: promptTemplates.updated_at,
      clusterId: promptTemplates.cluster_id,
    })
    .from(promptTemplates)
    .where(eq(promptTemplates.cluster_id, clusterId));
}

export async function searchRunConfigs(clusterId: string, search: string) {
  const searchResults = await embeddableServiceFunction.findSimilarEntities(
    clusterId,
    "prompt-template",
    search,
    10,
  );

  if (searchResults.length === 0) {
    return [];
  }

  const templates = await db
    .select({
      id: promptTemplates.id,
      name: promptTemplates.name,
      initialPrompt: promptTemplates.initial_prompt,
      attachedFunctions: promptTemplates.attached_functions,
      resultSchema: promptTemplates.result_schema,
      createdAt: promptTemplates.created_at,
      updatedAt: promptTemplates.updated_at,
      clusterId: promptTemplates.cluster_id,
    })
    .from(promptTemplates)
    .where(
      inArray(
        promptTemplates.id,
        searchResults.map((r) => r.embeddingId),
      ),
    );

  return searchResults
    .map((r) => {
      const template = templates.find((t) => t.id === r.embeddingId);

      if (!template) {
        logger.error("Template not found for embedding", r);
        return null;
      }

      return {
        ...template,
        similarity: r.similarity,
      };
    })
    .filter((t) => t !== null) as {
    id: string;
    name: string;
    initialPrompt: string;
    attachedFunctions: string[];
    resultSchema: unknown;
    createdAt: Date;
    updatedAt: Date;
    clusterId: string;
    similarity: number;
  }[];
}

export const validateSchema = ({
  schema,
  name,
}: {
  schema: any;
  name: string;
}) => {
  try {
    const resultSchemaErrors = validateFunctionSchema(
      schema as JsonSchemaInput,
    );

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

export const validateInput = ({
  schema,
  input,
}: {
  schema: any;
  input: any;
}) => {
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
  initialPrompt?: string;
  systemPrompt?: string;
  attachedFunctions?: string[];
  resultSchema?: unknown;

  interactive?: boolean;
  reasoningTraces?: boolean;
  callSummarization?: boolean;
  modelIdentifier?: ChatIdentifiers;

  input?: Record<string, unknown>;
  messageMetadata?: RunMessageMetadata;
};

type RunConfig = Awaited<ReturnType<typeof getRunConfig>>;

export const mergeRunConfigOptions = (
  options: RunOptions,
  runConfig: RunConfig,
) => {
  const mergedOptions: RunOptions = {
    initialPrompt: runConfig.initialPrompt ?? options.initialPrompt,
    systemPrompt: runConfig.systemPrompt ?? options.systemPrompt,
    attachedFunctions: runConfig.attachedFunctions ?? options.attachedFunctions,
    resultSchema: runConfig.resultSchema ?? options.resultSchema,

    interactive: options.interactive,
    reasoningTraces: options.reasoningTraces,
    callSummarization: options.callSummarization,
    modelIdentifier: options.modelIdentifier,
  };

  if (runConfig.inputSchema) {
    if (!options.input) {
      return {
        options: null,
        error: {
          status: 400 as const,
          body: {
            message: "Run configuration requires input object",
          },
        },
      };
    }

    const validationError = validateInput({
      schema: runConfig.inputSchema,
      input: options.input,
    });

    if (validationError) {
      return {
        options: null,
        error: validationError,
      };
    }
  }

  mergedOptions.messageMetadata = {
    displayable: {
      templateName: runConfig.name,
      templateId: runConfig.id,
      ...options.input,
    },
  };

  return {
    options: mergedOptions,
    error: null,
  };
};
