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
import { RunOptions, getAgent, mergeAgentOptions, validateSchema } from "../agents";
import { normalizeFunctionReference } from "../service-definitions";
import { timeline } from "../timeline";
import { getRunsByTag } from "./tags";
import {
  createRetry,
  createRun,
  deleteRun,
  getClusterRuns,
  getAgentMetrics,
  getRunDetails,
  updateRun,
  addMessageAndResumeWithRun,
} from "./";

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

      const run = await getRunDetails({
        clusterId,
        runId,
      });

      if (!run.id) {
        return {
          status: 404,
        };
      }

      return {
        status: 200,
        body: {
          ...run,
          result: run.result ?? null,
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

      const agent = body.agentId
        ? await getAgent({
            clusterId,
            id: body.agentId,
          })
        : undefined;

      if (body.agentId) {
        if (!agent) {
          throw new NotFoundError("Agent not found");
        }

        const merged = mergeAgentOptions(runOptions, agent);

        if (merged.error) {
          return merged.error;
        }

        runOptions = merged.options;

        runOptions.messageMetadata = {
          displayable: {
            templateName: agent.name,
            templateId: agent.id,
            ...body.input,
          },
        };
      }

      if (runOptions.input) {
        runOptions.initialPrompt = `${runOptions.initialPrompt}\n\n<DATA>\n${JSON.stringify(runOptions.input, null, 2)}\n</DATA>`;
      }

      const customAuth = auth.type === "custom" ? auth.isCustomAuth() : undefined;

      const run = await createRun({
        runId: runOptions.runId,
        userId: auth.entityId,
        clusterId,

        name: body.name,
        test: body.test?.enabled ?? false,
        testMocks: body.test?.mocks,
        tags: body.tags,

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
        await addMessageAndResumeWithRun({
          id: ulid(),
          userId: auth.entityId,
          clusterId,
          run,
          message: runOptions.initialPrompt,
          type: body.agentId ? "template" : "human",
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
          run_id: run.id,
          agent_id: run.agentId,
          cli_version: request.headers["x-cli-version"],
          user_agent: request.headers["user-agent"],
        },
      });

      return {
        status: 201,
        body: { id: run.id },
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

      await updateRun({
        id: runId,
        clusterId,
        feedbackComment: comment ?? undefined,
        feedbackScore: score ?? undefined,
        status: null,
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
      const { test, limit, tags, agentId } = request.query;
      let { userId } = request.query;

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });

      // Custom auth can only access their own Runs
      if (auth.type === "custom") {
        userId = auth.entityId;
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
          userId,
        });

        return {
          status: 200,
          body: result,
        };
      }

      const result = await getClusterRuns({
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

      const { messages, activity, jobs, run } = await timeline.getRunTimeline({
        clusterId,
        runId,
        messagesAfter,
        activityAfter,
      });

      if (!run) {
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
          run,
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
