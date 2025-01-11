import { initServer } from "@ts-rest/fastify";
import { generateOpenApi } from "@ts-rest/open-api";
import fs from "fs";
import path from "path";
import { ulid } from "ulid";
import util from "util";
import { BadRequestError } from "../utilities/errors";
import { deleteAgent, getAgent, listAgents, upsertAgent, validateSchema } from "./agents";
import { authRouter } from "./auth/router";
import { getBlobData } from "./blobs";
import { contract } from "./contract";
import * as data from "./data";
import { integrationsRouter } from "./integrations/router";
import { jobsRouter } from "./jobs/router";
import { machineRouter } from "./machines/router";
import * as management from "./management";
import { buildModel } from "./models";
import * as events from "./observability/events";
import { posthog } from "./posthog";
import { addMessageAndResume, assertRunReady, getRun } from "./runs";
import { editHumanMessage, getRunMessagesForDisplayWithPolling } from "./runs/messages";
import { runsRouter } from "./runs/router";
import { getServerStats } from "./server-stats";
import { getServiceDefinitions, getStandardLibraryToolsMeta } from "./service-definitions";
import { unqualifiedEntityId } from "./auth/auth";

const readFile = util.promisify(fs.readFile);

export const router = initServer().router(contract, {
  ...machineRouter.routes,
  ...runsRouter.routes,
  ...authRouter.routes,
  ...jobsRouter.routes,
  ...integrationsRouter.routes,
  live: async () => {
    await data.isAlive();

    return {
      status: 200,
      body: {
        status: "ok",
      },
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

    await management.deleteCluster({ clusterId });

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
        service: request.query.service,
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
  updateMessage: async request => {
    const { clusterId, runId, messageId } = request.params;
    const { message } = request.body;

    const run = await getRun({ clusterId, runId });
    await assertRunReady({
      clusterId,
      run: {
        id: run.id,
        status: run.status,
        interactive: run.interactive,
        clusterId: run.clusterId,
      },
    });

    const auth = request.request.getAuth();
    await auth.canManage({ run: { clusterId, runId } });

    const messages = await editHumanMessage({
      id: messageId,
      userId: auth.entityId,
      clusterId,
      runId,
      message,
    });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:message_update",
      groups: {
        organization: auth.organizationId,
        cluster: clusterId,
      },
      properties: {
        cluster_id: clusterId,
        run_id: runId,
        message_id: messageId,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    return {
      status: 200,
      body: messages.inserted,
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
  listServices: async request => {
    const { clusterId } = request.params;
    const user = request.request.getAuth();
    await user.canAccess({ cluster: { clusterId } });

    const services = await getServiceDefinitions({
      clusterId,
    });

    const transformedServices = services.map(service => ({
      name: service.service,
      timestamp: service.timestamp ?? new Date(),
      description: service.definition.description,
      functions: service.definition.functions?.map(fn => ({
        name: fn.name,
        description: fn.description,
        schema: fn.schema,
        config: fn.config,
      })),
    }));

    return {
      status: 200,
      body: transformedServices,
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

  createAgent: async request => {
    const { clusterId } = request.params;
    const { name, initialPrompt, systemPrompt, attachedFunctions, resultSchema, inputSchema } =
      request.body;

    const auth = request.request.getAuth();
    await auth.canManage({ cluster: { clusterId } });
    auth.canCreate({ agent: true });

    if (resultSchema) {
      const validationError = validateSchema({
        schema: resultSchema,
        name: "resultSchema",
      });
      if (validationError) {
        return validationError;
      }
    }

    if (inputSchema) {
      const validationError = validateSchema({
        schema: inputSchema,
        name: "inputSchema",
      });
      if (validationError) {
        return validationError;
      }
    }

    const result = await upsertAgent({
      id: ulid(),
      clusterId,
      name,
      initialPrompt,
      systemPrompt,
      attachedFunctions,
      resultSchema,
      inputSchema,
    });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:agent_create",
      groups: {
        organization: auth.organizationId,
        cluster: clusterId,
      },
      properties: {
        cluster_id: clusterId,
        agent_id: result.id,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    return {
      status: 201,
      body: result,
    };
  },

  upsertAgent: async request => {
    const { agentId, clusterId } = request.params;
    const { name, initialPrompt, systemPrompt, attachedFunctions, resultSchema, inputSchema } =
      request.body;

    const auth = request.request.getAuth();

    await auth.canManage({ cluster: { clusterId } });
    if (agentId) {
      await auth.canManage({ agent: { agentId, clusterId } });
    } else {
      auth.canCreate({ agent: true });
    }

    if (resultSchema) {
      const validationError = validateSchema({
        schema: resultSchema,
        name: "resultSchema",
      });
      if (validationError) {
        return validationError;
      }
    }

    if (inputSchema) {
      const validationError = validateSchema({
        schema: inputSchema,
        name: "inputSchema",
      });
      if (validationError) {
        return validationError;
      }
    }

    const result = await upsertAgent({
      id: agentId,
      clusterId,
      name,
      initialPrompt,
      systemPrompt,
      attachedFunctions,
      resultSchema,
      inputSchema,
    });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:agent_upsert",
      groups: {
        organization: auth.organizationId,
        cluster: clusterId,
      },
      properties: {
        cluster_id: clusterId,
        agent_id: result.id,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    return {
      status: 200,
      body: result,
    };
  },

  getAgent: async request => {
    const { clusterId, agentId } = request.params;
    const { withPreviousVersions } = request.query;

    const user = request.request.getAuth();
    await user.canAccess({ cluster: { clusterId } });

    const template = await getAgent({
      clusterId,
      id: agentId,
      withPreviousVersions: withPreviousVersions === "true",
    });

    return {
      status: 200,
      body: template,
    };
  },

  deleteAgent: async request => {
    const { clusterId, agentId } = request.params;

    const auth = request.request.getAuth();
    await auth.canManage({ agent: { clusterId, agentId } });

    await deleteAgent({
      clusterId,
      id: agentId,
    });

    posthog?.capture({
      distinctId: unqualifiedEntityId(auth.entityId),
      event: "api:agent_delete",
      groups: {
        organization: auth.organizationId,
        cluster: clusterId,
      },
      properties: {
        cluster_id: clusterId,
        agent_id: agentId,
        cli_version: request.headers["x-cli-version"],
        user_agent: request.headers["user-agent"],
      },
    });

    return {
      status: 204,
      body: undefined,
    };
  },

  listAgents: async request => {
    const { clusterId } = request.params;

    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });

    const templates = await listAgents({ clusterId });

    return {
      status: 200,
      body: templates,
    };
  },

  createStructuredOutput: async request => {
    const { clusterId } = request.params;
    const { prompt, resultSchema, modelId, temperature } = request.body;

    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });

    const model = buildModel({
      identifier: modelId,
      modelOptions: {
        temperature,
      },
      purpose: "structured_output.create",
    });

    if (resultSchema) {
      const validationError = validateSchema({
        schema: resultSchema,
        name: "resultSchema",
      });
      if (validationError) {
        return validationError;
      }
    } else {
      throw new BadRequestError("resultSchema is required");
    }

    const result = await model.structured({
      messages: [{ role: "user", content: prompt }],
      schema: resultSchema,
    });

    return {
      status: 200,
      body: result.structured,
    };
  },
  getServerStats: async () => {
    const stats = await getServerStats();

    return {
      status: 200,
      body: stats,
    };
  },
  getStandardLibraryMeta: async request => {
    const { clusterId } = request.params;

    const auth = request.request.getAuth();
    await auth.canAccess({ cluster: { clusterId } });

    const tools = getStandardLibraryToolsMeta();

    return {
      status: 200,
      body: {
        tools,
      },
    };
  },
});
