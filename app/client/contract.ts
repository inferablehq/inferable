import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

const machineHeaders = {
  "x-machine-id": z.string().optional(),
  "x-machine-sdk-version": z.string().optional(),
  "x-machine-sdk-language": z.string().optional(),
  "x-forwarded-for": z.string().optional().optional(),
  "x-sentinel-no-mask": z.string().optional().optional(),
  "x-sentinel-unmask-keys": z.string().optional(),
};

// Alphanumeric, underscore, hyphen, no whitespace. From 6 to 128 characters.
const userDefinedIdRegex = /^[a-zA-Z0-9-_]{6,128}$/;

const functionReference = z.object({
  service: z.string(),
  function: z.string(),
});

const anyObject = z.object({}).passthrough();

export const interruptSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("approval"),
  }),
]);

export const blobSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["application/json", "image/png", "image/jpeg"]),
  encoding: z.enum(["base64"]),
  size: z.number(),
  createdAt: z.date(),
  jobId: z.string().nullable(),
  workflowId: z.string().nullable(),
});

export const VersionedTextsSchema = z.object({
  current: z.object({
    version: z.string(),
    content: z.string(),
  }),
  history: z.array(
    z.object({
      version: z.string(),
      content: z.string(),
    })
  ),
});

export const integrationSchema = z.object({
  toolhouse: z
    .object({
      apiKey: z.string(),
    })
    .optional()
    .nullable(),
  langfuse: z
    .object({
      publicKey: z.string(),
      secretKey: z.string(),
      baseUrl: z.string(),
      sendMessagePayloads: z.boolean(),
    })
    .optional()
    .nullable(),
  tavily: z
    .object({
      apiKey: z.string(),
    })
    .optional()
    .nullable(),
  valtown: z
    .object({
      endpoint: z.string().url(),
      token: z.string(),
    })
    .optional()
    .nullable(),
  slack: z
    .object({
      nangoConnectionId: z.string(),
      botUserId: z.string(),
      teamId: z.string(),
    })
    .optional()
    .nullable(),
});

const genericMessageDataSchema = z
  .object({
    message: z.string(),
    details: z.object({}).passthrough().optional(),
  })
  .strict();

const resultDataSchema = z
  .object({
    id: z.string(),
    result: z.object({}).passthrough(),
  })
  .strict();

export const learningSchema = z.object({
  summary: z
    .string()
    .describe("The new information that was learned. Be generic, do not refer to the entities."),
  entities: z
    .array(
      z.object({
        name: z.string().describe("The name of the entity this learning relates to."),
        type: z.enum(["tool"]),
      })
    )
    .describe("The entities this learning relates to."),
  relevance: z.object({
    temporality: z
      .enum(["transient", "persistent"])
      .describe("How long do you expect this learning to be relevant for."),
  }),
});

const agentDataSchema = z
  .object({
    done: z.boolean().optional(),
    result: anyObject.optional(),
    message: z.string().optional(),
    learnings: z.array(learningSchema).optional(),
    issue: z.string().optional(),
    invocations: z
      .array(
        z.object({
          id: z.string().optional(),
          toolName: z.string(),
          reasoning: z.string().optional(),
          input: z.object({}).passthrough(),
        })
      )
      .optional(),
  })
  .strict();

const peripheralMessageDataSchema = z.object({
  id: z.string(),
  createdAt: z.date().optional(),
  pending: z.boolean().optional(),
  displayableContext: z.record(z.string()).optional().nullable(),
});

export const unifiedMessageDataSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("agent"),
      data: agentDataSchema,
    })
    .merge(peripheralMessageDataSchema),
  z
    .object({
      type: z.literal("invocation-result"),
      data: resultDataSchema,
    })
    .merge(peripheralMessageDataSchema),
  z
    .object({
      type: z.literal("human"),
      data: genericMessageDataSchema,
    })
    .merge(peripheralMessageDataSchema),
  z
    .object({
      type: z.literal("template"),
      data: genericMessageDataSchema,
    })
    .merge(peripheralMessageDataSchema),
  z
    .object({
      type: z.literal("supervisor"),
      data: genericMessageDataSchema,
    })
    .merge(peripheralMessageDataSchema),
  z
    .object({
      type: z.literal("agent-invalid"),
      data: genericMessageDataSchema,
    })
    .merge(peripheralMessageDataSchema),
]);

export type UnifiedMessage = z.infer<typeof unifiedMessageDataSchema>;

export type MessageTypes =
  | "agent"
  | "human"
  | "template"
  | "invocation-result"
  | "supervisor"
  | "agent-invalid";

export type UnifiedMessageOfType<T extends MessageTypes> = Extract<UnifiedMessage, { type: T }>;

export const FunctionConfigSchema = z.object({
  cache: z
    .object({
      keyPath: z.string(),
      ttlSeconds: z.number(),
    })
    .optional(),
  retryCountOnStall: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  private: z.boolean().default(false).optional(),
});

export const definition = {
  createMachine: {
    method: "POST",
    path: "/machines",
    headers: z.object({
      authorization: z.string(),
      ...machineHeaders,
    }),
    body: z.object({
      service: z.string().optional(),
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
    }),
    responses: {
      200: z.object({
        clusterId: z.string(),
      }),
      204: z.undefined(),
    },
  },
  live: {
    method: "GET",
    path: "/live",
    responses: {
      200: z.object({
        status: z.string(),
      }),
    },
  },
  createCallApproval: {
    method: "POST",
    path: "/clusters/:clusterId/calls/:callId/approval",
    headers: z.object({
      authorization: z.string(),
    }),
    pathParams: z.object({
      clusterId: z.string(),
      callId: z.string(),
    }),
    responses: {
      204: z.undefined(),
      404: z.object({
        message: z.string(),
      }),
    },
    body: z.object({
      approved: z.boolean(),
    }),
  },
  createCallBlob: {
    method: "POST",
    path: "/clusters/:clusterId/calls/:callId/blobs",
    headers: z.object({
      authorization: z.string(),
      "x-machine-id": z.string(),
      "x-machine-sdk-version": z.string(),
      "x-machine-sdk-language": z.string(),
      "x-forwarded-for": z.string().optional(),
      "x-sentinel-no-mask": z.string().optional(),
    }),
    pathParams: z.object({
      clusterId: z.string(),
      callId: z.string(),
    }),
    responses: {
      201: z.object({
        id: z.string(),
      }),
      401: z.undefined(),
      404: z.object({
        message: z.string(),
      }),
    },
    body: blobSchema.omit({ id: true, createdAt: true, jobId: true, workflowId: true }).and(
      z.object({
        data: z.string(),
      })
    ),
  },
  getContract: {
    method: "GET",
    path: "/contract",
    responses: {
      200: z.object({
        contract: z.string(),
      }),
    },
  },
  listClusters: {
    method: "GET",
    path: "/clusters",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          createdAt: z.date(),
          description: z.string().nullable(),
        })
      ),
      401: z.undefined(),
    },
  },
  createCluster: {
    method: "POST",
    path: "/clusters",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      204: z.undefined(),
    },
    body: z.object({
      description: z.string().describe("Human readable description of the cluster"),
    }),
  },
  upsertIntegrations: {
    method: "PUT",
    path: "/clusters/:clusterId/integrations",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.undefined(),
      401: z.undefined(),
      400: z.object({
        message: z.string(),
      }),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
    body: integrationSchema,
  },
  getIntegrations: {
    method: "GET",
    path: "/clusters/:clusterId/integrations",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: integrationSchema,
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  deleteCluster: {
    method: "DELETE",
    path: "/clusters/:clusterId",
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.undefined(),
    responses: {
      204: z.undefined(),
    },
  },
  updateCluster: {
    method: "PUT",
    path: "/clusters/:clusterId",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      additionalContext: VersionedTextsSchema.optional().describe(
        "Additional cluster context which is included in all runs"
      ),
      debug: z
        .boolean()
        .optional()
        .describe(
          "Enable additional logging (Including prompts and results) for use by Inferable support"
        ),
      enableCustomAuth: z.boolean().optional(),
      enableKnowledgebase: z.boolean().optional(),
      handleCustomAuthFunction: z.string().optional(),
    }),
  },
  getCluster: {
    method: "GET",
    path: "/clusters/:clusterId",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        additionalContext: VersionedTextsSchema.nullable(),
        createdAt: z.date(),
        debug: z.boolean(),
        enableCustomAuth: z.boolean(),
        handleCustomAuthFunction: z.string(),
        enableKnowledgebase: z.boolean(),
        lastPingAt: z.date().nullable(),
      }),
      401: z.undefined(),
      404: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  listEvents: {
    method: "GET",
    path: "/clusters/:clusterId/events",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.array(
        z.object({
          type: z.string(),
          machineId: z.string().nullable(),
          service: z.string().nullable(),
          createdAt: z.date(),
          jobId: z.string().nullable(),
          targetFn: z.string().nullable(),
          resultType: z.string().nullable(),
          status: z.string().nullable(),
          workflowId: z.string().nullable(),
          meta: z.any().nullable(),
          id: z.string(),
        })
      ),
      401: z.undefined(),
      404: z.undefined(),
    },
    query: z.object({
      type: z.string().optional(),
      jobId: z.string().optional(),
      machineId: z.string().optional(),
      service: z.string().optional(),
      workflowId: z.string().optional(),
      includeMeta: z.string().optional(),
    }),
  },
  listUsageActivity: {
    method: "GET",
    path: "/clusters/:clusterId/usage",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        modelUsage: z.array(
          z.object({
            date: z.string(),
            modelId: z.string().nullable(),
            totalInputTokens: z.number(),
            totalOutputTokens: z.number(),
            totalModelInvocations: z.number(),
          })
        ),
        agentRuns: z.array(
          z.object({
            date: z.string(),
            totalAgentRuns: z.number(),
          })
        ),
      }),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  getEventMeta: {
    method: "GET",
    path: "/clusters/:clusterId/events/:eventId/meta",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        type: z.string(),
        machineId: z.string().nullable(),
        service: z.string().nullable(),
        createdAt: z.date(),
        jobId: z.string().nullable(),
        targetFn: z.string().nullable(),
        resultType: z.string().nullable(),
        status: z.string().nullable(),
        meta: z.unknown(),
        id: z.string(),
      }),
      401: z.undefined(),
      404: z.undefined(),
    },
  },
  createRun: {
    method: "POST",
    path: "/clusters/:clusterId/runs",
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.object({
      runId: z
        .string()
        .optional()
        .describe(
          "The run ID. If not provided, a new run will be created. If provided, the run will be created with the given"
        )
        .refine(
          val => !val || /^[0-9A-Z]{26}$/.test(val),
          "Run ID must be a valid ULID (26 uppercase alphanumeric characters)"
        ),
      initialPrompt: z
        .string()
        .optional()
        .describe("An initial 'human' message to trigger the run"),
      systemPrompt: z.string().optional().describe("A system prompt for the run."),
      name: z
        .string()
        .optional()
        .describe("The name of the run, if not provided it will be generated"),
      model: z
        .enum(["claude-3-5-sonnet", "claude-3-haiku"])
        .optional()
        .describe("The model identifier for the run"),
      resultSchema: anyObject
        .optional()
        .describe(
          "A JSON schema definition which the result object should conform to. By default the result will be a JSON object which does not conform to any schema"
        ),
      attachedFunctions: z
        .array(functionReference)
        .optional()
        .describe(
          "An array of functions to make available to the run. By default all functions in the cluster will be available"
        ),
      onStatusChange: z
        .object({
          function: functionReference.describe("A function to call when the run status changes"),
        })
        .optional()
        .describe("Mechanism for receiving notifications when the run status changes"),
      metadata: z
        .record(z.string())
        .optional()
        .describe("Run metadata which can be used to filter runs"),
      test: z
        .object({
          enabled: z.boolean().default(false),
          mocks: z
            .record(
              z.object({
                output: z.object({}).passthrough().describe("The mock output of the function"),
              })
            )
            .optional()
            .describe(
              "Function mocks to be used in the run. (Keys should be function in the format <SERVICE>_<FUNCTION>)"
            ),
        })
        .optional()
        .describe("When provided, the run will be marked as as a test / evaluation"),
      configId: z.string().optional().describe("DEPRECATED"),
      agentId: z.string().optional().describe("The agent ID to use"),
      input: z
        .object({})
        .passthrough()
        .describe(
          "Structured input arguments to merge with the initial prompt. The schema must match the agent input schema if defined"
        )
        .optional(),
      context: anyObject
        .optional()
        .describe("Additional context to propogate to all calls in the run"),
      reasoningTraces: z.boolean().default(true).optional().describe("Enable reasoning traces"),
      callSummarization: z
        .boolean()
        .default(false)
        .optional()
        .describe("Enable summarization of oversized call results"),
      interactive: z
        .boolean()
        .default(true)
        .describe("Allow the run to be continued with follow-up messages / message edits"),
      enableResultGrounding: z.boolean().default(false).describe("Enable result grounding"),
    }),
    responses: {
      201: z.object({
        id: z.string().describe("The id of the newly created run"),
      }),
      401: z.undefined(),
      400: z.object({
        message: z.string(),
      }),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  deleteRun: {
    method: "DELETE",
    path: "/clusters/:clusterId/runs/:runId",
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.undefined(),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
    pathParams: z.object({
      runId: z.string(),
      clusterId: z.string(),
    }),
  },
  createMessage: {
    method: "POST",
    path: "/clusters/:clusterId/runs/:runId/messages",
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.object({
      id: z
        .string()
        .length(26)
        .regex(/^[0-9a-z]+$/i)
        .optional(),
      message: z.string(),
      type: z.enum(["human", "supervisor"]).optional(),
    }),
    responses: {
      201: z.undefined(),
      401: z.undefined(),
    },
    pathParams: z.object({
      runId: z.string(),
      clusterId: z.string(),
    }),
  },
  listMessages: {
    method: "GET",
    path: "/clusters/:clusterId/runs/:runId/messages",
    headers: z.object({
      authorization: z.string(),
    }),
    query: z.object({
      waitTime: z.coerce
        .number()
        .min(0)
        .max(20)
        .default(0)
        .describe("Time in seconds to keep the request open waiting for a response"),
      after: z.string().default("0"),
      limit: z.coerce.number().min(10).max(50).default(50),
    }),
    responses: {
      200: z.array(unifiedMessageDataSchema),
      401: z.undefined(),
    },
  },
  listRuns: {
    method: "GET",
    path: "/clusters/:clusterId/runs",
    headers: z.object({
      authorization: z.string(),
    }),
    query: z.object({
      userId: z.string().optional(),
      test: z.coerce
        .string()
        .transform(value => value === "true")
        .optional(),
      limit: z.coerce.number().min(10).max(50).default(50),
      metadata: z.string().optional().describe("Filter runs by a metadata value (value:key)"),
      agentId: z.string().optional(),
    }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          userId: z.string().nullable(),
          createdAt: z.date(),
          status: z.enum(["pending", "running", "paused", "done", "failed"]).nullable(),
          test: z.boolean(),
          agentId: z.string().nullable(),
          agentVersion: z.number().nullable(),
          feedbackScore: z.number().nullable(),
        })
      ),
      401: z.undefined(),
    },
  },
  getRun: {
    method: "GET",
    path: "/clusters/:clusterId/runs/:runId",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        id: z.string(),
        userId: z.string().nullable(),
        status: z.enum(["pending", "running", "paused", "done", "failed"]).nullable(),
        failureReason: z.string().nullable(),
        test: z.boolean(),
        feedbackComment: z.string().nullable(),
        feedbackScore: z.number().nullable(),
        context: z.any().nullable(),
        authContext: z.any().nullable(),
        result: anyObject.nullable(),
        metadata: z.record(z.string()).nullable(),
        attachedFunctions: z.array(z.string()).nullable(),
      }),
      401: z.undefined(),
    },
  },
  createFeedback: {
    method: "POST",
    path: "/clusters/:clusterId/runs/:runId/feedback",
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.object({
      comment: z.string().describe("Feedback comment").nullable(),
      score: z.number().describe("Score between 0 and 1").min(0).max(1).nullable(),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
      404: z.undefined(),
    },
    pathParams: z.object({
      runId: z.string(),
      clusterId: z.string(),
    }),
  },
  oas: {
    method: "GET",
    path: "/public/oas.json",
    responses: {
      200: z.unknown(),
    },
  },
  updateMessage: {
    method: "PUT",
    path: "/clusters/:clusterId/runs/:runId/messages/:messageId",
    headers: z.object({ authorization: z.string() }),
    body: z.object({ message: z.string() }),
    responses: {
      200: z.object({
        id: z.string(),
      }),
      404: z.object({ message: z.string() }),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
      runId: z.string(),
      messageId: z.string(),
    }),
  },
  getClusterExport: {
    method: "GET",
    path: "/clusters/:clusterId/export",
    headers: z.object({ authorization: z.string() }),
    pathParams: z.object({ clusterId: z.string() }),
    responses: {
      200: z.object({
        data: z.string(),
      }),
    },
  },
  consumeClusterExport: {
    method: "POST",
    path: "/clusters/:clusterId/import",
    headers: z.object({ authorization: z.string() }),
    body: z.object({ data: z.string() }),
    pathParams: z.object({ clusterId: z.string() }),
    responses: {
      200: z.object({ message: z.string() }),
      400: z.undefined(),
    },
  },
  getCall: {
    method: "GET",
    path: "/clusters/:clusterId/calls/:callId",
    headers: z.object({ authorization: z.string() }),
    pathParams: z.object({
      clusterId: z.string(),
      callId: z.string(),
    }),
    responses: {
      200: z.object({
        id: z.string(),
        status: z.string(),
        targetFn: z.string(),
        service: z.string(),
        executingMachineId: z.string().nullable(),
        targetArgs: z.string(),
        result: z.string().nullable(),
        resultType: z.string().nullable(),
        createdAt: z.date(),
        blobs: z.array(blobSchema),
      }),
    },
  },
  listRunReferences: {
    method: "GET",
    path: "/clusters/:clusterId/runs/:runId/references",
    headers: z.object({ authorization: z.string() }),
    pathParams: z.object({
      clusterId: z.string(),
      runId: z.string(),
    }),
    query: z.object({
      token: z.string(),
      before: z.string(),
    }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          result: z.string().nullable(),
          createdAt: z.date(),
          status: z.string(),
          targetFn: z.string(),
          service: z.string(),
          executingMachineId: z.string().nullable(),
        })
      ),
    },
  },
  createApiKey: {
    method: "POST",
    path: "/clusters/:clusterId/api-keys",
    headers: z.object({ authorization: z.string() }),
    pathParams: z.object({
      clusterId: z.string(),
    }),
    body: z.object({
      name: z.string(),
    }),
    responses: {
      200: z.object({
        id: z.string(),
        key: z.string(),
      }),
    },
  },
  listApiKeys: {
    method: "GET",
    path: "/clusters/:clusterId/api-keys",
    headers: z.object({ authorization: z.string() }),
    pathParams: z.object({
      clusterId: z.string(),
    }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          createdAt: z.date(),
          createdBy: z.string(),
          revokedAt: z.date().nullable(),
        })
      ),
    },
  },
  revokeApiKey: {
    method: "DELETE",
    path: "/clusters/:clusterId/api-keys/:keyId",
    headers: z.object({ authorization: z.string() }),
    pathParams: z.object({
      clusterId: z.string(),
      keyId: z.string(),
    }),
    body: z.undefined(),
    responses: {
      204: z.undefined(),
    },
  },

  listMachines: {
    method: "GET",
    path: "/clusters/:clusterId/machines",
    headers: z.object({
      authorization: z.string(),
    }),
    query: z.object({
      limit: z.coerce.number().min(10).max(50).default(50),
    }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          lastPingAt: z.date(),
          ip: z.string(),
        })
      ),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },

  listServices: {
    method: "GET",
    path: "/clusters/:clusterId/services",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.array(
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
          timestamp: z.date(),
        })
      ),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  getRunTimeline: {
    method: "GET",
    path: "/clusters/:clusterId/runs/:runId/timeline",
    headers: z.object({ authorization: z.string() }),
    query: z.object({
      messagesAfter: z.string().default("0"),
      activityAfter: z.string().default("0"),
    }),
    pathParams: z.object({
      clusterId: z.string(),
      runId: z.string(),
    }),
    responses: {
      404: z.undefined(),
      200: z.object({
        messages: z.array(unifiedMessageDataSchema),
        activity: z.array(
          z.object({
            id: z.string(),
            type: z.string(),
            machineId: z.string().nullable(),
            service: z.string().nullable(),
            createdAt: z.date(),
            jobId: z.string().nullable(),
            targetFn: z.string().nullable(),
          })
        ),
        jobs: z.array(
          z.object({
            id: z.string(),
            status: z.string(),
            targetFn: z.string(),
            service: z.string(),
            resultType: z.string().nullable(),
            createdAt: z.date(),
            approved: z.boolean().nullable(),
            approvalRequested: z.boolean().nullable(),
          })
        ),
        run: z.object({
          id: z.string(),
          userId: z.string().nullable(),
          status: z.enum(["pending", "running", "paused", "done", "failed"]).nullable(),
          failureReason: z.string().nullable(),
          test: z.boolean(),
          context: z.any().nullable(),
          authContext: z.any().nullable(),
          feedbackComment: z.string().nullable(),
          feedbackScore: z.number().nullable(),
          attachedFunctions: z.array(z.string()).nullable(),
          name: z.string().nullable(),
        }),
        blobs: z.array(blobSchema),
      }),
    },
  },
  getBlobData: {
    method: "GET",
    path: "/clusters/:clusterId/blobs/:blobId/data",
    headers: z.object({ authorization: z.string() }),
    pathParams: z.object({
      clusterId: z.string(),
      blobId: z.string(),
    }),
    responses: {
      200: z.any(),
      404: z.undefined(),
    },
  },
  upsertFunctionMetadata: {
    method: "PUT",
    path: "/clusters/:clusterId/:service/:function/metadata",
    headers: z.object({
      authorization: z.string(),
    }),
    pathParams: z.object({
      clusterId: z.string(),
      service: z.string(),
      function: z.string(),
    }),
    body: z.object({
      additionalContext: z.string().optional(),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
  },
  getFunctionMetadata: {
    method: "GET",
    path: "/clusters/:clusterId/:service/:function/metadata",
    headers: z.object({
      authorization: z.string(),
    }),
    pathParams: z.object({
      clusterId: z.string(),
      service: z.string(),
      function: z.string(),
    }),
    responses: {
      200: z.object({
        additionalContext: z.string().nullable(),
      }),
      401: z.undefined(),
      404: z.object({ message: z.string() }),
    },
  },
  deleteFunctionMetadata: {
    method: "DELETE",
    path: "/clusters/:clusterId/:service/:function/metadata",
    headers: z.object({
      authorization: z.string(),
    }),
    pathParams: z.object({
      clusterId: z.string(),
      service: z.string(),
      function_name: z.string(),
    }),
    body: z.undefined(),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
  },
  getAgent: {
    method: "GET",
    path: "/clusters/:clusterId/agents/:agentId",
    headers: z.object({ authorization: z.string() }),
    responses: {
      200: z.object({
        id: z.string(),
        clusterId: z.string(),
        name: z.string(),
        initialPrompt: z.string().nullable(),
        systemPrompt: z.string().nullable(),
        attachedFunctions: z.array(z.string()),
        resultSchema: anyObject.nullable(),
        inputSchema: anyObject.nullable(),
        createdAt: z.date(),
        updatedAt: z.date(),
        versions: z.array(
          z.object({
            version: z.number(),
            name: z.string(),
            initialPrompt: z.string().nullable(),
            systemPrompt: z.string().nullable(),
            attachedFunctions: z.array(z.string()),
            resultSchema: anyObject.nullable(),
            inputSchema: anyObject.nullable(),
          })
        ),
      }),
      401: z.undefined(),
      404: z.object({ message: z.string() }),
    },
    pathParams: z.object({
      clusterId: z.string(),
      agentId: z.string(),
    }),
    query: z.object({
      withPreviousVersions: z.enum(["true", "false"]).default("false"),
    }),
  },
  createAgent: {
    method: "POST",
    path: "/clusters/:clusterId/agents",
    headers: z.object({ authorization: z.string() }),
    body: z.object({
      name: z.string(),
      initialPrompt: z.string().optional(),
      systemPrompt: z.string().optional().describe("The initial system prompt for the run."),
      attachedFunctions: z.array(z.string()).optional(),
      resultSchema: anyObject.optional(),
      inputSchema: z.object({}).passthrough().optional().nullable(),
    }),
    responses: {
      201: z.object({ id: z.string() }),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  upsertAgent: {
    method: "PUT",
    path: "/clusters/:clusterId/agents/:agentId",
    headers: z.object({ authorization: z.string() }),
    pathParams: z.object({
      clusterId: z.string(),
      agentId: z.string().regex(userDefinedIdRegex),
    }),
    body: z.object({
      name: z.string().optional(),
      initialPrompt: z.string().optional(),
      systemPrompt: z.string().optional().describe("The initial system prompt for the run."),
      attachedFunctions: z.array(z.string()).optional(),
      resultSchema: z.object({}).passthrough().optional().nullable(),
      inputSchema: z.object({}).passthrough().optional().nullable(),
    }),
    responses: {
      200: z.object({
        id: z.string(),
        clusterId: z.string(),
        name: z.string(),
        initialPrompt: z.string().nullable(),
        systemPrompt: z.string().nullable(),
        attachedFunctions: z.array(z.string()),
        resultSchema: z.unknown().nullable(),
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
      401: z.undefined(),
      404: z.object({ message: z.string() }),
    },
  },
  deleteAgent: {
    method: "DELETE",
    path: "/clusters/:clusterId/agent/:agentId",
    headers: z.object({ authorization: z.string() }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
      404: z.object({ message: z.string() }),
    },
    body: z.undefined(),
    pathParams: z.object({
      clusterId: z.string(),
      agentId: z.string(),
    }),
  },
  listAgents: {
    method: "GET",
    path: "/clusters/:clusterId/agents",
    headers: z.object({ authorization: z.string() }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          clusterId: z.string(),
          name: z.string(),
          initialPrompt: z.string().nullable(),
          systemPrompt: z.string().nullable(),
          attachedFunctions: z.array(z.string()),
          resultSchema: z.unknown().nullable(),
          createdAt: z.date(),
          updatedAt: z.date(),
        })
      ),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  getAgentMetrics: {
    method: "GET",
    path: "/clusters/:clusterId/agents/:agentId/metrics",
    headers: z.object({ authorization: z.string() }),
    responses: {
      200: z.array(
        z.object({
          createdAt: z.date(),
          feedbackScore: z.number().nullable(),
          jobFailureCount: z.number(),
          timeToCompletion: z.number(),
          jobCount: z.number(),
        })
      ),
    },
    pathParams: z.object({
      clusterId: z.string(),
      agentId: z.string(),
    }),
  },
  createClusterKnowledgeArtifact: {
    method: "POST",
    path: "/clusters/:clusterId/knowledge",
    headers: z.object({ authorization: z.string() }),
    body: z.object({
      artifacts: z.array(
        z.object({
          id: z.string(),
          data: z.string(),
          tags: z.array(z.string()).transform(tags => tags.map(tag => tag.toLowerCase().trim())),
          title: z.string(),
        })
      ),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  getKnowledge: {
    method: "GET",
    path: "/clusters/:clusterId/knowledge",
    headers: z.object({ authorization: z.string() }),
    query: z.object({
      query: z.string(),
      limit: z.coerce.number().min(1).max(50).default(5),
      tag: z.string().optional(),
    }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          data: z.string(),
          tags: z.array(z.string()),
          title: z.string(),
          similarity: z.number(),
        })
      ),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  upsertKnowledgeArtifact: {
    method: "PUT",
    path: "/clusters/:clusterId/knowledge/:artifactId",
    headers: z.object({ authorization: z.string() }),
    body: z.object({
      data: z.string(),
      tags: z.array(z.string()).transform(tags => tags.map(tag => tag.toLowerCase().trim())),
      title: z.string(),
    }),
    responses: {
      200: z.object({
        id: z.string(),
      }),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
      artifactId: z.string().regex(userDefinedIdRegex),
    }),
  },
  deleteKnowledgeArtifact: {
    method: "DELETE",
    path: "/clusters/:clusterId/knowledge/:artifactId",
    headers: z.object({ authorization: z.string() }),
    body: z.undefined(),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
  },
  getAllKnowledgeArtifacts: {
    method: "GET",
    path: "/clusters/:clusterId/knowledge-export",
    headers: z.object({ authorization: z.string() }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          data: z.string(),
          tags: z.array(z.string()),
          title: z.string(),
        })
      ),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  createRunRetry: {
    method: "POST",
    path: "/clusters/:clusterId/runs/:runId/retry",
    headers: z.object({ authorization: z.string() }),
    body: z.object({
      messageId: z.string(),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
  },
  createCall: {
    method: "POST",
    path: "/clusters/:clusterId/calls",
    query: z.object({
      waitTime: z.coerce
        .number()
        .min(0)
        .max(20)
        .default(0)
        .describe("Time in seconds to keep the request open waiting for a response"),
    }),
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.object({
      service: z.string(),
      function: z.string(),
      input: z.object({}).passthrough(),
    }),
    responses: {
      401: z.undefined(),
      200: z.object({
        id: z.string(),
        result: z.any().nullable(),
        resultType: z.enum(["resolution", "rejection", "interrupt"]).nullable(),
        status: z.enum(["pending", "running", "success", "failure", "stalled"]),
      }),
    },
  },
  createCallResult: {
    method: "POST",
    path: "/clusters/:clusterId/calls/:callId/result",
    headers: z.object({
      authorization: z.string(),
      ...machineHeaders,
    }),
    pathParams: z.object({
      clusterId: z.string(),
      callId: z.string(),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
    body: z.object({
      result: z.any(),
      resultType: z.enum(["resolution", "rejection", "interrupt"]),
      meta: z.object({
        functionExecutionTime: z.number().optional(),
      }),
    }),
  },
  listCalls: {
    method: "GET",
    path: "/clusters/:clusterId/calls",
    query: z.object({
      service: z.string(),
      status: z.enum(["pending", "running", "paused", "done", "failed"]).default("pending"),
      limit: z.coerce.number().min(1).max(20).default(10),
      acknowledge: z.coerce.boolean().default(false).describe("Should calls be marked as running"),
    }),
    pathParams: z.object({
      clusterId: z.string(),
    }),
    headers: z.object({
      authorization: z.string(),
      ...machineHeaders,
    }),
    responses: {
      401: z.undefined(),
      410: z.object({
        message: z.string(),
      }),
      200: z.array(
        z.object({
          id: z.string(),
          function: z.string(),
          input: z.any(),
          authContext: z.any().nullable(),
          runContext: z.any().nullable(),
          approved: z.boolean(),
        })
      ),
    },
  },
  getKnowledgeArtifact: {
    method: "GET",
    path: "/clusters/:clusterId/knowledge/:artifactId",
    headers: z.object({ authorization: z.string() }),
    responses: {
      200: z.object({
        id: z.string(),
        data: z.string(),
        tags: z.array(z.string()),
        title: z.string(),
      }),
      401: z.undefined(),
      404: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
      artifactId: z.string(),
    }),
  },
  createStructuredOutput: {
    method: "POST",
    path: "/clusters/:clusterId/structured-output",
    headers: z.object({ authorization: z.string() }),
    body: z.object({
      prompt: z.string(),
      resultSchema: anyObject
        .optional()
        .describe(
          "A JSON schema definition which the result object should conform to. By default the result will be a JSON object which does not conform to any schema"
        ),
      modelId: z.enum(["claude-3-5-sonnet", "claude-3-haiku"]),
      temperature: z
        .number()
        .optional()
        .describe("The temperature to use for the model")
        .default(0.5),
    }),
    responses: {
      200: z.unknown(),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  getServerStats: {
    method: "GET",
    path: "/stats",
    responses: {
      200: z.object({
        functionCalls: z.object({
          count: z.number(),
        }),
        tokenUsage: z.object({
          input: z.number(),
          output: z.number(),
        }),
        refreshedAt: z.number(),
      }),
    },
  },
  createNangoSession: {
    method: "POST",
    path: "/clusters/:clusterId/nango/sessions",
    pathParams: z.object({
      clusterId: z.string(),
    }),
    headers: z.object({ authorization: z.string() }),
    body: z.object({
      integration: z.string(),
    }),
    responses: {
      200: z.object({
        token: z.string(),
      }),
    },
  },
  createNangoEvent: {
    method: "POST",
    path: "/nango/events",
    headers: z.object({ "x-nango-signature": z.string() }),
    body: z.object({}).passthrough(),
    responses: {
      200: z.undefined(),
    },
  },
} as const;

export const contract = c.router(definition);
