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
import { createBlob, getBlobData, getBlobsForJobs } from "./blobs";
import { getClusterDetails } from "./cluster";
import { contract, interruptSchema } from "./contract";
import * as data from "./data";
import { getIntegrations, upsertIntegrations } from "./integrations/integrations";
import { getSession, nango, webhookSchema } from "./integrations/nango";
import { validateConfig } from "./integrations/toolhouse";
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
import { listTools, recordPoll, upsertToolDefinition } from "./tools";
import { createWorkflowExecution, getWorkflowExecutionEvents } from "./workflows/executions";

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
      const validationError = validateSchema({
        schema: body.resultSchema,
        name: "resultSchema",
      });
      if (validationError) {
        return validationError;
      }
    }

    const attachedFunctions =
      body.tools ?? body.attachedFunctions?.map(f => (typeof f === "string" ? f : f.function));

    const runOptions: RunOptions = {
      id: body.id || body.runId || ulid(),
      initialPrompt: body.initialPrompt,
      systemPrompt: body.systemPrompt,
      attachedFunctions,
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
      enableSummarization: runOptions.callSummarization,
      modelIdentifier: runOptions.modelIdentifier,
      interactive: runOptions.interactive,
      systemPrompt: runOptions.systemPrompt,
      attachedFunctions: runOptions.attachedFunctions,
      reasoningTraces: runOptions.reasoningTraces,
      enableResultGrounding: runOptions.enableResultGrounding,
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
      type: "runFeedbackSubmitted",
      clusterId,
      workflowId: runId,
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
    const { test, limit, tags } = request.query;
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
      userId,
      test: test ?? false,
      limit,
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
        run: {
          ...run,
          attachedFunctions: undefined,
          tools: run.attachedFunctions,
        },
        blobs,
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
        });

        await jobs.requestApproval({
          jobId,
          clusterId,
        });

        return {
          status: 204,
          body: undefined,
        };
      } else {
        throw new BadRequestError("Unsupported interrupt type");
      }
    }

    if (!!result) {
      // Max result size 500kb
      const data = Buffer.from(JSON.stringify(result));
      if (Buffer.byteLength(data) > 500 * 1024) {
        logger.info("Job result too large, persisting as blob", {
          jobId,
        });

        const job = await jobs.getJob({ clusterId, jobId });

        if (!job) {
          throw new NotFoundError("Job not found");
        }

        await createBlob({
          data: data.toString("base64"),
          size: Buffer.byteLength(data),
          encoding: "base64",
          type: "application/json",
          name: "Oversize Job result",
          clusterId,
          runId: job.runId ?? undefined,
          jobId: job.id ?? undefined,
        });

        result = {
          message: "The result was too large and was returned to the user directly",
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
    const { limit, acknowledge, status } = request.query;
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

    request.reply.header("retry-after", 1);

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
  createJobBlob: async request => {
    const { jobId, clusterId } = request.params;
    const body = request.body;

    const machine = request.request.getAuth().isMachine();
    machine.canManage({ job: { clusterId, jobId } });

    const job = await jobs.getJob({ clusterId, jobId });

    if (!job) {
      return {
        status: 404,
        body: {
          message: "Job not found",
        },
      };
    }

    const blob = await createBlob({
      ...body,
      clusterId,
      runId: job.runId ?? undefined,
      jobId: jobId ?? undefined,
    });

    return {
      status: 201,
      body: blob,
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

    if (request.body.toolhouse) {
      try {
        await validateConfig(request.body);
      } catch (error) {
        return {
          status: 400,
          body: {
            message: `Failed to validate ToolHouse config: ${error}`,
          },
        };
      }
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

    const result = await events.getActivityByClusterId({
      clusterId,
      filters: {
        type: request.query.type,
        jobId: request.query.jobId,
        machineId: request.query.machineId,
        workflowId: request.query.workflowId,
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

    const result = await events.getMetaForActivity({
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
  getBlobData: async request => {
    const { clusterId, blobId } = request.params;

    const user = request.request.getAuth();
    await user.canAccess({ cluster: { clusterId } });

    const blob = await getBlobData({ clusterId, blobId });

    if (blob.runId) {
      await user.canAccess({
        run: { clusterId, runId: blob.runId },
      });
    }

    if (!blob) {
      return {
        status: 404,
      };
    }

    return {
      status: 200,
      body: blob.data,
    };
  },

  createWorkflowExecution: async request => {
    const { clusterId, workflowName } = request.params;

    const machine = request.request.getAuth().isMachine();
    machine.canAccess({ cluster: { clusterId } });
    machine.canCreate({ run: true });

    const result = await createWorkflowExecution(clusterId, workflowName, request.body);

    return {
      status: 201,
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
  getWorkflowExecutionEvents: async request => {
    const { clusterId, workflowName, executionId } = request.params;
    const { after } = request.query;

    const user = request.request.getAuth();
    await user.canAccess({ cluster: { clusterId } });

    const events = await getWorkflowExecutionEvents({
      clusterId,
      workflowName,
      executionId,
      after,
    });

    return {
      status: 200,
      body: events,
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
});
