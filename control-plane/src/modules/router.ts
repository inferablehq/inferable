import crypto from "crypto";
import { initServer } from "@ts-rest/fastify";
import { generateOpenApi } from "@ts-rest/open-api";
import { dereferenceSync } from "dereference-json-schema";
import fs from "fs";
import { JsonSchemaInput } from "inferable/bin/types";
import path from "path";
import { ulid } from "ulid";
import util from "util";
import { env } from "../utilities/env";
import { AuthenticationError, BadRequestError, NotFoundError } from "../utilities/errors";
import { safeParse } from "../utilities/safe-parse";
import { unqualifiedEntityId } from "./auth/auth";
import { createApiKey, listApiKeys, revokeApiKey } from "./auth/cluster";
import { getClusterDetails } from "./cluster";
import { contract, interruptSchema } from "./contract";
import * as data from "./data";
import { getIntegrations, upsertIntegrations } from "./integrations/integrations";
import { getSession, nango, webhookSchema } from "./integrations/nango";
import * as jobs from "./jobs/jobs";
import { kv } from "./kv";
import { upsertMachine } from "./machines";
import * as management from "./management";
import * as events from "./observability/events";
import { logger } from "./observability/logger";
import { packer } from "./packer";
import { posthog } from "./posthog";
import {
  addMessageAndResume,
  createRun,
  deleteRun,
  getClusterBackgroundRun,
  getClusterRuns,
  getRunDetails,
  getRunResult,
  RunOptions,
  updateRunFeedback,
  validateSchema,
} from "./runs";
import { getRunMessagesForDisplayWithPolling } from "./runs/messages";
import { getRunsByTag } from "./runs/tags";
import { timeline } from "./timeline";
import { getWorkflowTools, listTools, recordPoll, upsertToolDefinition } from "./tools";
import { persistJobInterrupt } from "./jobs/job-results";
import {
  createWorkflowExecution,
  listWorkflowExecutions,
  getWorkflowExecutionTimeline,
} from "./workflows/executions";
import { createWorkflowLog } from "./workflows/logs";
import { inferType, structured, validateJsonSchema, validTypes } from "@l1m/core";
import { buildModel } from "./models";
import Anthropic from "@anthropic-ai/sdk";

const readFile = util.promisify(fs.readFile);

export const router = initServer().router(contract, {
  createMachine: async request => {
    const machine = request.request.getAuth().isMachine();

    const machineId = request.headers["x-machine-id"];

    if (!machineId) {
      throw new BadRequestError("Request does not contain machine ID header");
    }

    const tools = request.body.tools ?? request.body.functions;

    if (request.body.functions) {
      logger.info("Machine is polling using deprecated functions field", {
        clusterId: machine.clusterId,
        machineId,
      });
    }

    const derefedFns = tools?.map(fn => {
      const schema = fn.schema ? safeParse(fn.schema) : { success: true, data: undefined };

      if (!schema.success) {
        throw new BadRequestError(`Function ${fn.name} has an invalid schema.`);
      }

      return {
        clusterId: machine.clusterId,
        name: fn.name,
        description: fn.description,
        schema: schema.data ? JSON.stringify(dereferenceSync(schema.data)) : undefined,
        config: fn.config,
      };
    });

    await Promise.all([
      upsertMachine({
        clusterId: machine.clusterId,
        machineId,
        sdkVersion: request.headers["x-machine-sdk-version"],
        sdkLanguage: request.headers["x-machine-sdk-language"],
        xForwardedFor: request.headers["x-forwarded-for"],
        ip: request.request.ip,
      }),
      derefedFns &&
        Promise.all(
          derefedFns?.map(fn =>
            upsertToolDefinition({
              name: fn.name,
              clusterId: machine.clusterId,
              description: fn.description,
              schema: fn.schema,
              config: fn.config,
            })
          )
        ),
    ]);

    events.write({
      type: "machineRegistered",
      clusterId: machine.clusterId,
      machineId,
    });

    return {
      status: 200,
      body: {
        clusterId: machine.clusterId,
      },
    };
  },
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
        id: run.id,
        userId: run.userId ?? null,
        status: run.status,
        type: run.type,
        failureReason: run.failureReason ?? null,
        test: run.test ?? false,
        feedbackComment: run.feedbackComment ?? null,
        feedbackScore: run.feedbackScore ?? null,
        context: run.context ?? null,
        authContext: run.authContext ?? null,
        result: run.result ?? null,
        tags: run.tags ?? null,
        tools: run.attachedFunctions ?? null,
      },
    };
  },
  createRun: async request => {
    const { clusterId } = request.params;
    const body = request.body;

    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });
    auth.canCreate({ run: true });

    const id = body.id || body.runId || ulid();

    let provider;

    if (request.headers["x-provider-key"] && request.headers["x-provider-model"] && request.headers["x-provider-url"]) {
      provider = {
        key: request.headers["x-provider-key"],
        model: request.headers["x-provider-model"],
        url: request.headers["x-provider-url"]
      };
    }

    if (body.runId) {
      logger.warn("Using deprecated runId field");
    }

    if (body.attachedFunctions && body.attachedFunctions.length == 0) {
      return {
        status: 400,
        body: {
          message: "attachedFunctions cannot be an empty array",
        },
      };
    }

    if (body.tools && body.tools.length == 0) {
      return {
        status: 400,
        body: {
          message: "tools cannot be an empty array",
        },
      };
    }

    if (body.attachedFunctions) {
      logger.warn("Using deprecated attachedFunctions field");
    }

    if (body.resultSchema) {
      if ("type" in body.resultSchema && body.resultSchema.type !== "object") {
        return {
          status: 400,
          body: {
            message: "resultSchema must be an object",
          },
        };
      }

      const validationError = validateSchema({
        schema: body.resultSchema,
        name: "resultSchema",
      });
      if (validationError) {
        logger.info("Invalid resultSchema", {
          resultSchema: body.resultSchema,
          validationError,
        });
        return validationError;
      }
    }

    const attachedFunctions =
      body.tools ?? body.attachedFunctions?.map(f => (typeof f === "string" ? f : f.function));

    const runOptions: RunOptions = {
      id,
      initialPrompt: body.initialPrompt,
      systemPrompt: body.systemPrompt,
      attachedFunctions,
      resultSchema: body.resultSchema
        ? (dereferenceSync(body.resultSchema) as JsonSchemaInput)
        : undefined,
      interactive: body.interactive,
      reasoningTraces: body.reasoningTraces,
      enableResultGrounding: body.enableResultGrounding,

      input: body.input,
    };

    if (runOptions.input) {
      runOptions.initialPrompt += `\n\n<DATA>\n${JSON.stringify(runOptions.input, null, 2)}\n</DATA>`;
    }

    const customAuth = auth.type === "custom" ? auth.isCustomAuth() : undefined;

    const run = await createRun({
      id: runOptions.id,
      userId: auth.entityId,
      clusterId,

      name: body.name,
      tags: body.tags,

      // Customer Auth context (In the future all auth types should inject context into the run)
      authContext: customAuth?.context,

      context: body.context,

      onStatusChangeHandler: body.onStatusChange,

      // Merged Options
      resultSchema: runOptions.resultSchema,
      interactive: runOptions.interactive,
      systemPrompt: runOptions.systemPrompt,
      attachedFunctions: runOptions.attachedFunctions,
      reasoningTraces: runOptions.reasoningTraces,
      enableResultGrounding: runOptions.enableResultGrounding,
      providerKey: provider?.key,
      providerUrl: provider?.url,
      providerModel: provider?.model,
    });

    // This run.created is a bit of a hack to allow us to create a run with an existing ID
    // and prevent us from adding a message to a run that already exists.
    if (run.created && runOptions.initialPrompt) {
      await addMessageAndResume({
        id: ulid(),
        userId: auth.entityId,
        clusterId,
        runId: run.id,
        message: runOptions.initialPrompt,
        type: "human",
        metadata: runOptions.messageMetadata,
        skipAssert: true,
      });
    }

    const cluster = await getClusterDetails(clusterId);

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:run_create",
      groups: {
        organization: auth.organizationId,
        cluster: clusterId,
      },
      properties: {
        cluster_id: clusterId,
        is_demo: cluster.is_demo,
        run_id: run.id,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    const result = run.status === "done" ? await getRunResult({ clusterId, runId: run.id }) : null;

    return {
      status: 201,
      body: {
        id: run.id,
        status: run.status,
        result: result ?? null,
      },
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
      distinctId: unqualifiedEntityId(auth.entityId),
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

    await updateRunFeedback({
      id: runId,
      clusterId,
      feedbackComment: comment ?? undefined,
      feedbackScore: score ?? undefined,
    });

    events.write({
      type: "feedbackSubmitted",
      clusterId,
      runId: runId,
      userId: auth.entityId,
      meta: {
        feedbackScore: score ?? undefined,
        feedbackComment: comment ?? undefined,
      },
    });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
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
    const { test, limit, tags, type } = request.query;
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
        userId,
      });

      return {
        status: 200,
        body: result.map(run => ({
          ...run,
          tags: {
            [key]: value,
          },
        })),
      };
    }

    const result = await getClusterRuns({
      clusterId,
      test: test ?? false,
      limit,
      type,
      userId,
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

    return {
      status: 200,
      body: {
        messages,
        activity,
        jobs,
        run: {
          ...run,
          attachedFunctions: undefined,
          tools: run.attachedFunctions,
        },
      },
    };
  },
  createApiKey: async request => {
    const { name } = request.body;
    const { clusterId } = request.params;

    const auth = request.request.getAuth().isAdmin();
    await auth.canManage({ cluster: { clusterId } });

    const { id, key } = await createApiKey({
      clusterId,
      name,
      createdBy: auth.entityId,
    });

    posthog?.identify({
      distinctId: id,
      properties: {
        key_name: name,
        auth_type: "api",
        created_by: auth.entityId,
      },
    });

    posthog?.groupIdentify({
      distinctId: id,
      groupType: "organization",
      groupKey: auth.organizationId,
    });

    posthog?.groupIdentify({
      distinctId: id,
      groupType: "cluster",
      groupKey: clusterId,
    });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:api_key_create",
      groups: {
        organization: auth.organizationId,
        cluster: clusterId,
      },
      properties: {
        cluster_id: clusterId,
        key_id: id,
        key_name: id,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    return {
      status: 200,
      body: { id, key },
    };
  },
  listApiKeys: async request => {
    const { clusterId } = request.params;

    const auth = request.request.getAuth().isAdmin();
    await auth.canManage({ cluster: { clusterId } });

    const apiKeys = await listApiKeys({ clusterId });

    return {
      status: 200,
      body: apiKeys,
    };
  },
  revokeApiKey: async request => {
    const { clusterId, keyId } = request.params;

    const auth = request.request.getAuth().isAdmin();
    await auth.canManage({ cluster: { clusterId } });

    await revokeApiKey({ clusterId, keyId });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:api_key_revoke",
      groups: {
        organization: auth.organizationId,
        cluster: clusterId,
      },
      properties: {
        cluster_id: clusterId,
        api_key_id: keyId,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    return {
      status: 204,
      body: undefined,
    };
  },
  createJob: async request => {
    const { clusterId } = request.params;

    const auth = request.request.getAuth();

    auth.canAccess({ cluster: { clusterId } });
    auth.canCreate({ call: true });

    const { function: fn, tool, input } = request.body;
    const { waitTime } = request.query;

    if (fn) {
      logger.warn("Using deprecated createJob.function field");
    }

    if (!fn && !tool) {
      throw new BadRequestError("No function or tool provided");
    }

    const { id } = await jobs.createJobV2({
      targetFn: (tool ?? fn)!,
      targetArgs: packer.pack(input),
      owner: { clusterId },
      runId: getClusterBackgroundRun(clusterId),
    });

    if (!waitTime || waitTime <= 0) {
      return {
        status: 200,
        body: {
          id,
          status: "pending",
          result: null,
          resultType: null,
        },
      };
    }

    const jobResult = await jobs.getJobStatusSync({
      jobId: id,
      owner: { clusterId },
      ttl: waitTime * 1000,
    });

    if (!jobResult) {
      throw new Error("Could not get call result");
    }

    const { status, result, resultType } = jobResult;

    const unpackedResult = result ? packer.unpack(result) : null;

    return {
      status: 200,
      body: {
        id,
        status,
        result: unpackedResult,
        resultType,
      },
    };
  },
  cancelJob: async request => {
    const { clusterId, jobId } = request.params;

    const auth = request.request.getAuth();

    auth.canManage({ job: { clusterId, jobId } });

    await jobs.cancelJob({
      jobId,
      clusterId,
    });

    return {
      status: 204,
      body: undefined,
    };
  },
  createJobResult: async request => {
    const { clusterId, jobId } = request.params;
    let { result, resultType } = request.body;
    const { meta } = request.body;

    const machine = request.request.getAuth().isMachine();
    machine.canManage({ job: { clusterId, jobId } });

    const machineId = request.headers["x-machine-id"];

    if (!machineId) {
      throw new BadRequestError("Request does not contain machine ID header");
    }

    if (resultType === "interrupt") {
      const parsed = await interruptSchema.safeParseAsync(result);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.message);
      }

      if (parsed.data.type === "approval") {
        logger.info("Requesting approval", {
          jobId,
          notification: parsed.data.notification,
        });

        await jobs.requestApproval({
          jobId,
          clusterId,
          notification: parsed.data.notification,
          machineId,
        });
      } else {
        // TODO: Should general interrupts allow notification?
        await persistJobInterrupt({
          jobId,
          clusterId,
          machineId,
        });
      }

      return {
        status: 204,
        body: undefined,
      };
    }

    if (!!result) {
      // Max result size 500kb
      const data = Buffer.from(JSON.stringify(result));
      if (Buffer.byteLength(data) > 500 * 1024) {
        logger.info("Job result too large, rejecting", {
          jobId,
        });

        const job = await jobs.getJob({ clusterId, jobId });

        if (!job) {
          throw new NotFoundError("Job not found");
        }


        result = {
          message: "The result was too large.",
        };

        resultType = "rejection";
      }
    }

    await Promise.all([
      upsertMachine({
        clusterId,
        machineId,
        sdkVersion: request.headers["x-machine-sdk-version"],
        sdkLanguage: request.headers["x-machine-sdk-language"],
        xForwardedFor: request.headers["x-forwarded-for"],
        ip: request.request.ip,
      }).catch(e => {
        // don't fail the request if the machine upsert fails

        logger.error("Failed to upsert machine", {
          error: e,
        });
      }),
      jobs.persistJobResult({
        owner: machine,
        result: packer.pack(result),
        resultType,
        functionExecutionTime: meta?.functionExecutionTime,
        jobId,
        machineId,
      }),
    ]);

    return {
      status: 204,
      body: undefined,
    };
  },
  listJobs: async request => {
    const { clusterId } = request.params;
    const { limit, acknowledge, status, waitTime } = request.query;
    const tools = request.query.tools?.split(",").map(t => t.trim());

    if (acknowledge && status !== "pending") {
      throw new BadRequestError("Only pending jobs can be acknowledged");
    }

    if (!acknowledge) {
      throw new Error("Not implemented");
    }

    const machineId = request.headers["x-machine-id"];

    if (!machineId) {
      throw new BadRequestError("Request does not contain machine ID header");
    }

    const machine = request.request.getAuth().isMachine();
    machine.canAccess({ cluster: { clusterId } });

    const [, missingTools, pollResult] = await Promise.all([
      upsertMachine({
        clusterId,
        machineId,
        sdkVersion: request.headers["x-machine-sdk-version"],
        sdkLanguage: request.headers["x-machine-sdk-language"],
        xForwardedFor: request.headers["x-forwarded-for"],
        ip: request.request.ip,
      }),
      tools &&
        recordPoll({
          clusterId,
          tools,
        }),
      tools &&
        jobs.pollJobsByTools({
          timeout: waitTime * 1000,
          clusterId,
          machineId,
          tools,
          limit,
        }),
    ]);

    if ((missingTools?.length ?? 0) > 0) {
      logger.info("Machine polling for unregistered tools", {
        tools: missingTools,
      });
      return {
        status: 410,
        body: {
          message: `Polling for unregistered tools: ${missingTools?.join(", ")}`,
        },
      };
    }
    const result = pollResult;

    return {
      status: 200,
      body:
        result?.map(job => ({
          id: job.id,
          function: job.targetFn,
          input: packer.unpack(job.targetArgs),
          authContext: job.authContext,
          runContext: job.runContext,
          approved: job.approved,
        })) ?? [],
    };
  },
  getJob: async request => {
    const { clusterId, jobId } = request.params;

    const auth = request.request.getAuth();
    await auth.canAccess({ job: { clusterId, jobId } });

    const job = await jobs.getJob({ clusterId, jobId });

    if (!job) {
      return {
        status: 404,
        body: {
          message: "Job not found",
        },
      };
    }

    if (job.runId) {
      await auth.canAccess({
        run: { clusterId, runId: job.runId },
      });
    }

    return {
      status: 200,
      body: job,
    };
  },
  createJobApproval: async request => {
    const { clusterId, jobId } = request.params;

    const auth = request.request.getAuth();
    await auth.canManage({ job: { clusterId, jobId } });

    const job = await jobs.getJob({ clusterId, jobId });

    if (!job) {
      return {
        status: 404,
        body: {
          message: "Job not found",
        },
      };
    }

    await jobs.submitApproval({
      jobId,
      clusterId,
      approved: request.body.approved,
    });

    return {
      status: 204,
      body: undefined,
    };
  },
  upsertIntegrations: async request => {
    const { clusterId } = request.params;

    const auth = request.request.getAuth().isAdmin();
    await auth.canManage({ cluster: { clusterId } });

    if (request.body.slack) {
      throw new BadRequestError("Slack integration is not user editable");
    }

    if (request.body.email) {
      throw new BadRequestError("Email integration is not supported");
    }

    await upsertIntegrations({
      clusterId,
      config: request.body,
    });

    Object.entries(request.body).forEach(([key, value]) => {
      const action = value === null ? "delete" : "update";

      posthog?.capture({
        distinctId: unqualifiedEntityId(auth.entityId),
        event: `api:integration_${action}`,
        groups: {
          organization: auth.organizationId,
          cluster: clusterId,
        },
        properties: {
          cluster_id: clusterId,
          integration: key,
          cli_version: request.headers["x-cli-version"],
          user_agent: request.headers["user-agent"],
        },
      });
    });

    return {
      status: 200,
      body: undefined,
    };
  },
  getIntegrations: async request => {
    const { clusterId } = request.params;

    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });
    auth.isAdmin();

    const integrations = await getIntegrations({
      clusterId,
    });

    return {
      status: 200,
      body: integrations,
    };
  },
  createNangoSession: async request => {
    if (!nango) {
      throw new Error("Nango is not configured");
    }

    const { clusterId } = request.params;
    const { integration } = request.body;

    if (integration !== env.NANGO_SLACK_INTEGRATION_ID) {
      throw new BadRequestError("Invalid Nango integration ID");
    }

    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });
    auth.isAdmin();

    return {
      status: 200,
      body: {
        token: await getSession({ clusterId, integrationId: env.NANGO_SLACK_INTEGRATION_ID }),
      },
    };
  },
  createNangoEvent: async request => {
    if (!nango) {
      throw new Error("Nango is not configured");
    }

    const signature = request.headers["x-nango-signature"];

    const isValid = nango.verifyWebhookSignature(signature, request.body);

    if (!isValid) {
      throw new AuthenticationError("Invalid Nango webhook signature");
    }

    logger.info("Received Nango webhook", {
      body: request.body,
    });

    const webhook = webhookSchema.safeParse(request.body);
    if (!webhook.success) {
      logger.error("Failed to parse Nango webhook", {
        error: webhook.error,
      });
      throw new BadRequestError("Invalid Nango webhook payload");
    }

    if (
      webhook.data.provider === "slack" &&
      webhook.data.operation === "creation" &&
      webhook.data.success
    ) {
      const connection = await nango.getConnection(
        webhook.data.providerConfigKey,
        webhook.data.connectionId
      );

      logger.info("New Slack connection registered", {
        connectionId: webhook.data.connectionId,
        teamId: connection.connection_config["team.id"],
      });

      const clusterId = connection.end_user?.id;

      if (!clusterId) {
        throw new BadRequestError("End user ID not found in Nango connection");
      }

      await upsertIntegrations({
        clusterId,
        config: {
          slack: {
            nangoConnectionId: webhook.data.connectionId,
            teamId: connection.connection_config["team.id"],
            botUserId: connection.connection_config["bot_user_id"],
          },
        },
      });
    }

    return {
      status: 200,
      body: undefined,
    };
  },
  live: async () => {
    await data.isAlive();

    return {
      status: 200,
      body: {
        status: "ok",
      },
    };
  },
  createEphemeralSetup: async request => {
    const result = await management.createEphemeralSetup(
      (request.headers["x-forwarded-for"] as string) ?? "unknown"
    );

    return {
      status: 200,
      body: result,
    };
  },
  getContract: async () => {
    return {
      status: 200,
      body: {
        contract: await readFile(path.join(__dirname, "..", "..", "src", "./modules/contract.ts"), {
          encoding: "utf-8",
        }),
      },
    };
  },
  listClusters: async request => {
    const user = request.request.getAuth().isAdmin();
    const clusters = await management.getClusters(user);

    return {
      status: 200,
      body: clusters,
    };
  },
  createCluster: async request => {
    const auth = request.request.getAuth().isAdmin();
    auth.canCreate({ cluster: true });

    const { description, name, isDemo = false } = request.body;

    const cluster = await management.createCluster({
      name,
      organizationId: auth.organizationId,
      description,
      isDemo,
    });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:cluster_create",
      groups: {
        organization: auth.organizationId,
        cluster: cluster.id,
      },
      properties: {
        cluster_id: cluster.id,
        is_demo: isDemo,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    return {
      status: 204,
      body: undefined,
    };
  },
  deleteCluster: async request => {
    const { clusterId } = request.params;
    const auth = request.request.getAuth().isAdmin();
    await auth.canManage({ cluster: { clusterId } });

    await management.markClusterForDeletion({ clusterId });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:cluster_delete",
      groups: {
        organization: auth.organizationId,
        cluster: clusterId,
      },
      properties: {
        cluster_id: clusterId,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    return {
      status: 204,
      body: undefined,
    };
  },
  updateCluster: async request => {
    const { clusterId } = request.params;
    const auth = request.request.getAuth().isAdmin();
    await auth.canManage({ cluster: { clusterId } });

    const {
      description,
      name,
      additionalContext,
      debug,
      enableCustomAuth,
      handleCustomAuthFunction,
      enableKnowledgebase,
    } = request.body;

    await management.editClusterDetails({
      name,
      organizationId: auth.organizationId,
      clusterId,
      description,
      additionalContext,
      debug,
      enableCustomAuth,
      handleCustomAuthFunction,
      enableKnowledgebase,
    });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:cluster_update",
      groups: {
        organization: auth.organizationId,
        cluster: clusterId,
      },
      properties: {
        cluster_id: clusterId,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    return {
      status: 204,
      body: undefined,
    };
  },
  getCluster: async request => {
    const { clusterId } = request.params;
    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });

    const cluster = await management.getClusterDetails({
      clusterId,
    });

    if (!cluster) {
      return {
        status: 404,
      };
    }

    return {
      status: 200,
      body: cluster,
    };
  },
  listEvents: async request => {
    const { clusterId } = request.params;
    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });

    const result = await events.getEventsByClusterId({
      clusterId,
      filters: {
        type: request.query.type,
        jobId: request.query.jobId,
        machineId: request.query.machineId,
        runId: request.query.runId,
      },
      includeMeta: request.query.includeMeta ? true : false,
    });

    return {
      status: 200,
      body: result,
    };
  },
  listUsageActivity: async request => {
    const { clusterId } = request.params;
    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });

    const result = await events.getUsageActivity({ clusterId });

    return {
      status: 200,
      body: result,
    };
  },
  getEventMeta: async request => {
    const { clusterId, eventId } = request.params;
    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });

    const result = await events.getMetaForEvent({
      clusterId,
      eventId,
    });

    return {
      status: 200,
      body: result,
    };
  },
  createMessage: async request => {
    const { clusterId, runId } = request.params;
    const { message, id, type } = request.body;

    const auth = request.request.getAuth();
    await auth.canManage({ run: { clusterId, runId } });

    await addMessageAndResume({
      id: id ?? ulid(),
      userId: auth?.entityId,
      clusterId,
      runId,
      message,
      type: type ?? "human",
    });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:message_create",
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
      status: 201,
      body: undefined,
    };
  },
  listMessages: async request => {
    const { clusterId, runId } = request.params;
    const auth = request.request.getAuth();
    await auth.canAccess({ run: { clusterId, runId } });

    const messages = await getRunMessagesForDisplayWithPolling({
      clusterId,
      runId,
      after: request.query.after,
      limit: request.query.limit,
      timeout: request.query.waitTime * 1000,
    });

    return {
      status: 200,
      body: messages,
    };
  },

  oas: async () => {
    const openApiDocument = generateOpenApi(
      contract,
      {
        info: {
          title: "Inferable API",
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          version: require("../../package.json").version,
        },
      },
      { setOperationId: true }
    );

    return {
      status: 200,
      body: openApiDocument,
    };
  },
  listMachines: async request => {
    const { clusterId } = request.params;
    const user = request.request.getAuth();
    await user.canAccess({ cluster: { clusterId } });

    const machines = await management.getClusterMachines({
      clusterId,
    });

    return {
      status: 200,
      body: machines,
    };
  },

  listWorkflows: async request => {
    const { clusterId } = request.params;

    const auth = request.request.getAuth();
    auth.canAccess({ cluster: { clusterId } });

    const tools = await getWorkflowTools({ clusterId });

    return {
      status: 200,
      body: tools,
    };
  },

  createWorkflowExecution: async request => {
    const { clusterId, workflowName } = request.params;

    const machine = request.request.getAuth();
    machine.canAccess({ cluster: { clusterId } });
    machine.canCreate({ run: true });

    const result = await createWorkflowExecution(clusterId, workflowName, request.body);

    return {
      status: 201,
      body: result,
    };
  },

  createWorkflowLog: async request => {
    const { clusterId, executionId } = request.params;
    const { status, data } = request.body;

    const machine = request.request.getAuth();
    machine.canAccess({ cluster: { clusterId } });

    const result = await createWorkflowLog({
      clusterId,
      workflowExecutionId: executionId,
      status,
      data,
    });

    return {
      status: 201,
      body: result,
    };
  },

  listWorkflowExecutions: async request => {
    const { clusterId } = request.params;
    const { workflowName, workflowExecutionStatus, workflowExecutionId, workflowVersion } =
      request.query;

    const auth = request.request.getAuth();
    auth.canAccess({ cluster: { clusterId } });

    const result = await listWorkflowExecutions({
      clusterId,
      filters: {
        workflowName,
        workflowExecutionStatus,
        workflowExecutionId,
        workflowVersion,
      },
    });

    return {
      status: 200,
      body: result,
    };
  },

  getWorkflowExecutionTimeline: async request => {
    const { clusterId, workflowName, executionId } = request.params;

    const result = await getWorkflowExecutionTimeline({ clusterId, workflowName, executionId });

    return {
      status: 200,
      body: result,
    };
  },

  getClusterKV: async request => {
    const { clusterId, key } = request.params;

    const machine = request.request.getAuth().isMachine();
    machine.canAccess({ cluster: { clusterId } });
    machine.canCreate({ run: true });

    const result = await kv.get(clusterId, key);

    return {
      status: 200,
      body: {
        value: result,
      },
    };
  },
  setClusterKV: async request => {
    const { clusterId, key } = request.params;
    const { value, onConflict } = request.body;

    const machine = request.request.getAuth().isMachine();
    machine.canAccess({ cluster: { clusterId } });
    machine.canCreate({ run: true });

    const setter = onConflict === "replace" ? kv.setOrReplace : kv.setIfNotExists;

    const result = await setter(clusterId, key, value);

    return {
      status: 200,
      body: {
        value: result,
      },
    };
  },
  listTools: async request => {
    const { clusterId } = request.params;

    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });

    const tools = await listTools({
      clusterId,
    });

    return {
      status: 200,
      body: tools,
    };
  },
  l1mStructured: async request => {
    const { input, instructions, schema } = request.body;
    const { clusterId } = request.params;

    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });

    const providerKey = request.headers["x-provider-key"];
    const providerModel = request.headers["x-provider-model"];
    const providerUrl = request.headers["x-provider-url"];

    const executionId = request.headers["x-workflow-execution-id"];
    const maxAttempts = request.headers["x-max-attempts"];

    if (!executionId) {
      return {
        status: 400,
        body: {
          message: "Missing x-workflow-execution-id header",
        },
      };
    }

    const hash = crypto.createHash("sha256");
    hash.update(input);
    hash.update(JSON.stringify(schema));
    providerModel && hash.update(providerModel);
    providerKey && hash.update(providerKey);
    hash.update(executionId);
    instructions && hash.update(instructions);

    const messageKey = `${executionId}_structured_${hash.digest("hex")}`;

    const existingMessage = await kv.get(clusterId, messageKey);
    if (existingMessage) {
      return {
        status: 200,
        body: {
          data: JSON.parse(existingMessage),
        },
      };
    }

    const schemaError = validateJsonSchema(schema);
    if (schemaError) {
      return {
        status: 400,
        body: {
          message: schemaError,
        },
      };
    }

    const type = await inferType(input);

    if (type && !validTypes.includes(type)) {
      return {
        status: 400,
        body: {
          message: "Provided content has invalid mime type",
          type,
        },
      };
    }

    let provider: Parameters<typeof structured>[0]["provider"] | undefined;

    if (!providerModel || !providerKey || !providerUrl) {
      const model = buildModel({
        identifier: "claude-3-5-sonnet",
        trackingOptions: {
          clusterId: clusterId,
        },
      });

      provider = async (params, prompt, previousAttempts) => {
        const messages: Anthropic.MessageParam[] = [];

        const { type, input } = params;

        if (type && type.startsWith("image/")) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: `${instructions} ${prompt}` },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: type as any,
                  data: input,
                },
              },
            ],
          });
        } else {
          messages.push({
            role: "user",
            content: `${input} ${instructions} ${prompt}`,
          });
        }

        if (previousAttempts.length > 0) {
          previousAttempts.forEach(attempt => {
            messages.push({
              role: "user",
              content:
                "You previously responded: " +
                attempt.raw +
                " which produced validation errors: " +
                attempt.errors,
            });
          });
        }

        const result = await model.call({
          messages,
        });

        if (result.raw.content[0]?.type === "text") {
          return result.raw.content[0].text;
        } else {
          throw new Error("Anthropic API returned invalid response");
        }
      };
    } else {
      provider = {
        key: providerKey,
        model: providerModel,
        url: providerUrl,
      };
    }

    const result = await structured({
      input,
      type,
      schema,
      maxAttempts: maxAttempts ? parseInt(maxAttempts) : 3,
      instructions,
      provider,
    });

    if (!result.valid || !result.structured) {
      return {
        status: 422,
        body: {
          message: "Failed to extract structured data",
          validation: result.errors,
          raw: result.raw,
          data: result.structured,
        },
      };
    }

    kv.setIfNotExists(clusterId, messageKey, JSON.stringify(result.structured));

    return {
      status: 200,
      body: {
        data: result.structured,
      },
    };
  },
});
