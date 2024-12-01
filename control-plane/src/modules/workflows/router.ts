import { initServer } from "@ts-rest/fastify";
import { JsonSchemaInput } from "inferable/bin/types";
import { contract } from "../contract";
import { getJobReferences, getJobsForWorkflow } from "../jobs/jobs";
import * as events from "../observability/events";
import { getWorkflowsByMetadata } from "./metadata";
import { getRunMessagesForDisplay } from "./workflow-messages";
import {
  createRetry,
  createRunWithMessage,
  deleteRun,
  getClusterWorkflows,
  getRunConfigMetrics,
  getWorkflow,
  getWorkflowDetail,
  updateWorkflow,
} from "./workflows";
import { posthog } from "../posthog";
import {
  RunOptions,
  getRunConfig,
  mergeRunConfigOptions,
  validateSchema,
} from "../prompt-templates";
import { AuthenticationError, NotFoundError } from "../../utilities/errors";
import { getBlobsForJobs } from "../blobs";
import { normalizeFunctionReference } from "../service-definitions";
import { dereferenceSync } from "dereference-json-schema";
import { logger } from "../observability/logger";

export const runsRouter = initServer().router(
  {
    getRun: contract.getRun,
    createRun: contract.createRun,
    deleteRun: contract.deleteRun,
    createFeedback: contract.createFeedback,
    listRuns: contract.listRuns,
    getRunTimeline: contract.getRunTimeline,
    getRunConfigMetrics: contract.getRunConfigMetrics,
    listRunReferences: contract.listRunReferences,
    createRunRetry: contract.createRunRetry,
  },
  {
    getRun: async (request) => {
      const { clusterId, runId } = request.params;
      const auth = request.request.getAuth();
      await auth.canAccess({ run: { clusterId, runId } });

      const workflow = await getWorkflowDetail({
        clusterId,
        runId,
      });

      if (!workflow.id) {
        return {
          status: 404,
        };
      }

      return {
        status: 200,
        body: workflow,
      };
    },
    createRun: async (request) => {
      const { clusterId } = request.params;
      const body = request.body;

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });
      auth.canCreate({ run: true });

      if (body.template) {
        logger.info("Depreacted `run.template` provided in call to createRun");
        body.config = body.template;
      }

      if (!body.initialPrompt && !body.config) {
        return {
          status: 400,
          body: {
            message:
              "initialPrompt or configId is required to create a workflow",
          },
        };
      }

      if (body.attachedFunctions && body.attachedFunctions.length == 0) {
        return {
          status: 400,
          body: {
            message: "attachedFunctions cannot be an empty array",
          },
        };
      }

      if (body.resultSchema) {
        const validationError = validateSchema({
          schema: body.resultSchema,
          name: "resultSchema",
        });
        if (validationError) {
          return validationError;
        }
      }

      // TODO: Validate that onStatusChange and attachedFunctions exist
      // TODO: Validate that onStatusChange schema is correct
      const onStatusChange =
        body.onStatusChange?.function &&
        normalizeFunctionReference(body.onStatusChange.function);

      let runOptions: RunOptions = {
        initialPrompt: body.initialPrompt,
        systemPrompt: body.systemPrompt,
        attachedFunctions: body.attachedFunctions?.map(
          normalizeFunctionReference,
        ),
        resultSchema: body.resultSchema
          ? (dereferenceSync(body.resultSchema) as JsonSchemaInput)
          : undefined,
        interactive: body.interactive,
        modelIdentifier: body.model,
        callSummarization: body.callSummarization,
        reasoningTraces: body.reasoningTraces,

        input: body.config?.input,
      };

      const runConfig = body.config
        ? await getRunConfig({
            clusterId,
            id: body.config.id,
          })
        : undefined;

      if (runConfig) {
        if (!runConfig) {
          throw new NotFoundError("Run configuration not found");
        }

        const merged = mergeRunConfigOptions(runOptions, runConfig);

        if (merged.error) {
          return merged.error;
        }

        runOptions = merged.options;
      }

      if (!runOptions.initialPrompt) {
        throw new Error("Failed to construct initialPrompt");
      }

      let customerProvidedAuth = undefined;
      if (auth.type === "customer-provided") {
        customerProvidedAuth = auth.isCustomerProvided();

        if (!runConfig) {
          throw new AuthenticationError(
            "Customer provided auth can only trigger run configurations",
          );
        }

        if (!runConfig.public) {
          throw new AuthenticationError(
            "Customer provided auth can only trigger public run configurations",
          );
        }
      }

      const workflow = await createRunWithMessage({
        user: auth,
        clusterId,

        name: body.name,
        test: body.test?.enabled ?? false,
        testMocks: body.test?.mocks,
        metadata: body.metadata,

        configId: runConfig?.id,
        type: runConfig ? "template" : "human",

        // Customer Auth
        authContext: customerProvidedAuth?.context,
        customerAuthToken: customerProvidedAuth?.token,

        context: body.context,

        onStatusChange,

        // Merged Options
        message: runOptions.initialPrompt,
        resultSchema: runOptions.resultSchema,
        enableSummarization: runOptions.callSummarization,
        modelIdentifier: runOptions.modelIdentifier,
        interactive: runOptions.interactive,
        systemPrompt: runOptions.systemPrompt,
        attachedFunctions: runOptions.attachedFunctions,
        messageMetadata: runOptions.messageMetadata,
        reasoningTraces: runOptions.reasoningTraces,
      });

      posthog?.capture({
        distinctId: auth.entityId,
        event: "api:run_create",
        groups: {
          organization: auth.organizationId,
          cluster: clusterId,
        },
        properties: {
          cluster_id: clusterId,
          run_id: workflow.id,
          config_id: workflow.configId,
          cli_version: request.headers["x-cli-version"],
          user_agent: request.headers["user-agent"],
        },
      });

      return {
        status: 201,
        body: { id: workflow.id },
      };
    },
    deleteRun: async (request) => {
      const { clusterId, runId } = request.params;

      const auth = request.request.getAuth();
      await auth.canManage({ run: { clusterId, runId } });

      await deleteRun({
        clusterId,
        runId,
      });

      posthog?.capture({
        distinctId: auth.entityId,
        event: "api:run_delete",
        groups: {
          organization: auth.organizationId,
          cluster: clusterId,
        },
        properties: {
          cluster_id: clusterId,
          run_id: runId,
          cli_version: request.headers["x-cli-version"],
          user_agent: request.headers["user-agent"],
        },
      });

      return {
        status: 204,
        body: undefined,
      };
    },
    createFeedback: async (request) => {
      const { clusterId, runId } = request.params;
      const { comment, score } = request.body;

      const auth = request.request.getAuth();
      await auth.canManage({ run: { clusterId, runId } });

      await updateWorkflow({
        id: runId,
        clusterId,
        feedbackComment: comment,
        feedbackScore: score,
      });

      events.write({
        type: "workflowFeedbackSubmitted",
        clusterId,
        workflowId: runId,
        userId: auth.entityId,
        meta: {
          feedbackScore: score ?? undefined,
          feedbackComment: comment ?? undefined,
        },
      });

      posthog?.capture({
        distinctId: auth.entityId,
        event: "api:feedback_create",
        groups: {
          organization: auth.organizationId,
          cluster: clusterId,
        },
        properties: {
          cluster_id: clusterId,
          run_id: runId,
          score: score,
          cli_version: request.headers["x-cli-version"],
          user_agent: request.headers["user-agent"],
        },
      });

      return {
        status: 204,
        body: undefined,
      };
    },
    listRuns: async (request) => {
      const { clusterId } = request.params;
      const { userId, test, limit, metadata, configId } = request.query;

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });

      if (metadata) {
        // ?meta=key:value
        const [key, value] = metadata.split(":");

        if (!key || !value) {
          return {
            status: 400,
            body: {
              message: "Invalid metadata filter format",
            },
          };
        }

        const result = await getWorkflowsByMetadata({
          clusterId,
          key,
          value,
          limit,
          configId,
        });

        return {
          status: 200,
          body: result,
        };
      }

      const result = await getClusterWorkflows({
        clusterId,
        userId,
        test: test ?? false,
        limit,
        configId: configId,
      });

      return {
        status: 200,
        body: result,
      };
    },
    getRunTimeline: async (request) => {
      const { clusterId, runId } = request.params;
      const { messagesAfter, jobsAfter, activityAfter } = request.query;

      const auth = request.request.getAuth();
      await auth.canAccess({ run: { clusterId, runId } });

      const [messages, activity, jobs, workflow] = await Promise.all([
        getRunMessagesForDisplay({
          clusterId,
          runId,
          after: messagesAfter,
        }),
        events.getActivityByWorkflowIdForUserAttentionLevel({
          clusterId,
          runId,
          userAttentionLevel: "info",
          after: activityAfter,
        }),
        getJobsForWorkflow({
          clusterId,
          runId,
          after: jobsAfter,
        }),
        getWorkflow({
          clusterId,
          runId,
        }),
      ]);

      if (!workflow) {
        return {
          status: 404,
        };
      }

      const blobs = await getBlobsForJobs({
        clusterId,
        jobIds: jobs.map((job) => job.id),
      });

      return {
        status: 200,
        body: {
          messages,
          activity,
          jobs,
          run: workflow,
          blobs,
        },
      };
    },
    getRunConfigMetrics: async (request) => {
      const { clusterId, configId } = request.params;

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });

      const result = await getRunConfigMetrics({
        clusterId,
        configId,
      });

      return {
        status: 200,
        body: result,
      };
    },
    listRunReferences: async (request) => {
      const { clusterId, runId } = request.params;
      const { token, before } = request.query;

      const auth = request.request.getAuth();
      await auth.canAccess({ run: { clusterId, runId } });

      const jobReferences = await getJobReferences({
        clusterId,
        runId,
        token,
        before: new Date(before),
      });

      return {
        status: 200,
        body: jobReferences,
      };
    },
    createRunRetry: async (request) => {
      const { clusterId, runId } = request.params;
      const { messageId } = request.body;

      const user = request.request.getAuth().isAdmin();
      await user.canAccess({ cluster: { clusterId } });

      await createRetry({
        clusterId,
        runId,
        messageId,
      });

      return {
        status: 204,
        body: undefined,
      };
    },
  },
);
