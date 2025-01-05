import { initServer } from "@ts-rest/fastify";
import { dereferenceSync } from "dereference-json-schema";
import { JsonSchemaInput } from "inferable/bin/types";
import { ulid } from "ulid";
import { NotFoundError } from "../../utilities/errors";
import { getBlobsForJobs } from "../blobs";
import { contract } from "../contract";
import { getJobReferences } from "../jobs/jobs";
import * as events from "../observability/events";
import { posthog } from "../posthog";
import {
  RunOptions,
  getAgent,
  mergeAgentOptions,
  validateSchema,
} from "../agents";
import { normalizeFunctionReference } from "../service-definitions";
import { timeline } from "../timeline";
import { getRunsByTag } from "./tags";
import {
  addMessageAndResume,
  createRetry,
  createRun,
  deleteRun,
  getClusterWorkflows,
  getAgentMetrics,
  getWorkflowDetail,
  updateWorkflow,
} from "./workflows";
import { logger } from "../observability/logger";

export const runsRouter = initServer().router(
  {
    getRun: contract.getRun,
    createRun: contract.createRun,
    deleteRun: contract.deleteRun,
    createFeedback: contract.createFeedback,
    listRuns: contract.listRuns,
    getRunTimeline: contract.getRunTimeline,
    getAgentMetrics: contract.getAgentMetrics,
    listRunReferences: contract.listRunReferences,
    createRunRetry: contract.createRunRetry,
  },
  {
    getRun: async request => {
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
        body: {
          ...workflow,
          result: workflow.result ?? null,
        },
      };
    },
    createRun: async request => {
      const { clusterId } = request.params;
      const body = request.body;

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });
      auth.canCreate({ run: true });

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
        body.onStatusChange?.function && normalizeFunctionReference(body.onStatusChange.function);

      let runOptions: RunOptions & { runId?: string } = {
        runId: body.runId,
        initialPrompt: body.initialPrompt,
        systemPrompt: body.systemPrompt,
        attachedFunctions: body.attachedFunctions?.map(normalizeFunctionReference),
        resultSchema: body.resultSchema
          ? (dereferenceSync(body.resultSchema) as JsonSchemaInput)
          : undefined,
        interactive: body.interactive,
        modelIdentifier: body.model,
        callSummarization: body.callSummarization,
        reasoningTraces: body.reasoningTraces,
        enableResultGrounding: body.enableResultGrounding,

        input: body.input,
      };

      const agentId = body.agentId ?? body.configId;

      if (!!body.configId) {
        logger.warn(
          "Deprecated configId usage in createRun",
        )
      }

      const agent = agentId
        ? await getAgent({
            clusterId,
            id: agentId
          })
        : undefined;

      if (agentId) {
        if (!agent) {
          throw new NotFoundError("Agent not found");
        }

        const merged = mergeAgentOptions(runOptions, agent);

        if (merged.error) {
          return merged.error;
        }

        runOptions = merged.options;
      }

      if (runOptions.input) {
        runOptions.initialPrompt = `${runOptions.initialPrompt}\n\n<DATA>\n${JSON.stringify(runOptions.input, null, 2)}\n</DATA>`;
      }

      const customAuth = auth.type === "custom" ? auth.isCustomAuth() : undefined;

      const tags = body.tags ?? body.metadata;

      if (!!body.metadata) {
        logger.warn(
          "Deprecated metadata usage in createRun",
        )
      }

      const workflow = await createRun({
        runId: runOptions.runId,
        userId: auth.entityId,
        clusterId,

        name: body.name,
        test: body.test?.enabled ?? false,
        testMocks: body.test?.mocks,
        tags,

        agentId: agent?.id,

        // Customer Auth context (In the future all auth types should inject context into the run)
        authContext: customAuth?.context,

        context: body.context,

        onStatusChange,

        // Merged Options
        resultSchema: runOptions.resultSchema,
        enableSummarization: runOptions.callSummarization,
        modelIdentifier: runOptions.modelIdentifier,
        interactive: runOptions.interactive,
        systemPrompt: runOptions.systemPrompt,
        attachedFunctions: runOptions.attachedFunctions,
        reasoningTraces: runOptions.reasoningTraces,
        enableResultGrounding: runOptions.enableResultGrounding,
      });

      if (runOptions.initialPrompt) {
        await addMessageAndResume({
          id: ulid(),
          userId: auth.entityId,
          clusterId,
          runId: workflow.id,
          message: runOptions.initialPrompt,
          type: agentId ? "template" : "human",
          metadata: runOptions.messageMetadata,
          skipAssert: true,
        });
      }

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
          agent_id: workflow.agentId,
          cli_version: request.headers["x-cli-version"],
          user_agent: request.headers["user-agent"],
        },
      });

      return {
        status: 201,
        body: { id: workflow.id },
      };
    },
    deleteRun: async request => {
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
    createFeedback: async request => {
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
    listRuns: async request => {
      const { clusterId } = request.params;
      const { test, limit, metadata, agentId } = request.query;
      let { userId, tags } = request.query;

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });

      // Custom auth can only access their own Runs
      if (auth.type === "custom") {
        userId = auth.entityId
      }

      tags = tags ?? metadata;

      if (request.query.metadata) {
        logger.warn(
          "Deprecated metadata usage in listRuns",
        )
      }

      if (tags) {
        // ?meta=key:value
        const [key, value] = tags.split(":");

        if (!key || !value) {
          return {
            status: 400,
            body: {
              message: "Invalid tag filter format",
            },
          };
        }

        const result = await getRunsByTag({
          clusterId,
          key,
          value,
          limit,
          agentId,
          userId
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
        agentId,
      });

      return {
        status: 200,
        body: result,
      };
    },
    getRunTimeline: async request => {
      const { clusterId, runId } = request.params;
      const { messagesAfter, activityAfter } = request.query;

      const auth = request.request.getAuth();
      await auth.canAccess({ run: { clusterId, runId } });

      const { messages, activity, jobs, workflow } = await timeline.getRunTimeline({
        clusterId,
        runId,
        messagesAfter,
        activityAfter,
      });

      if (!workflow) {
        return {
          status: 404,
        };
      }

      const blobs = await getBlobsForJobs({
        clusterId,
        jobIds: jobs.map(job => job.id),
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
    getAgentMetrics: async request => {
      const { clusterId, agentId } = request.params;

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });

      const result = await getAgentMetrics({
        clusterId,
        agentId,
      });

      return {
        status: 200,
        body: result,
      };
    },
    listRunReferences: async request => {
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
    createRunRetry: async request => {
      const { clusterId, runId } = request.params;

      const user = request.request.getAuth().isAdmin();
      await user.canAccess({ cluster: { clusterId } });

      await createRetry({
        clusterId,
        runId,
      });

      return {
        status: 204,
        body: undefined,
      };
    },
  }
);
