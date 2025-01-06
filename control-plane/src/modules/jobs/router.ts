import { contract, interruptSchema } from "../contract";
import { initServer } from "@ts-rest/fastify";
import * as jobs from "../jobs/jobs";
import { packer } from "../packer";
import { upsertMachine } from "../machines";
import { BadRequestError, NotFoundError } from "../../utilities/errors";
import { createBlob } from "../blobs";
import { logger } from "../observability/logger";
import { recordServicePoll } from "../service-definitions";
import { getJob } from "../jobs/jobs";
import { getClusterBackgroundRun } from "../runs";

export const jobsRouter = initServer().router(
  {
    createCall: contract.createCall,
    createCallResult: contract.createCallResult,
    listCalls: contract.listCalls,
    createCallBlob: contract.createCallBlob,
    getCall: contract.getCall,
    createCallApproval: contract.createCallApproval,
  },
  {
    createCall: async request => {
      const { clusterId } = request.params;

      const auth = request.request.getAuth();

      auth.canAccess({ cluster: { clusterId } });
      auth.canCreate({ call: true });

      const { function: fn, input, service } = request.body;
      const { waitTime } = request.query;

      const { id } = await jobs.createJob({
        service: service,
        targetFn: fn,
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
    createCallResult: async request => {
      const { clusterId, jobId } = request.params;
      let { result, resultType } = request.body;
      const { meta } = request.body;

      const machine = request.request.getAuth().isMachine();
      machine.canAccess({ cluster: { clusterId } });

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

          const job = await getJob({ clusterId, jobId });

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
    listCalls: async request => {
      const { clusterId } = request.params;
      const { service, limit, acknowledge, status } = request.query;

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

      const [, servicePing, pollResult] = await Promise.all([
        upsertMachine({
          clusterId,
          machineId,
          sdkVersion: request.headers["x-machine-sdk-version"],
          sdkLanguage: request.headers["x-machine-sdk-language"],
          xForwardedFor: request.headers["x-forwarded-for"],
          ip: request.request.ip,
        }),
        recordServicePoll({
          clusterId,
          service,
        }),
        jobs.pollJobs({
          clusterId,
          machineId,
          service,
          limit,
        }),
      ]);

      if (servicePing === false) {
        logger.info("Machine polling for unregistered service", {
          service,
        });
        return {
          status: 410,
          body: {
            message: `Service ${service} is not registered`,
          },
        };
      }

      request.reply.header("retry-after", 1);

      return {
        status: 200,
        body: pollResult.map(job => ({
          id: job.id,
          function: job.targetFn,
          input: packer.unpack(job.targetArgs),
          authContext: job.authContext,
          runContext: job.runContext,
          approved: job.approved,
        })),
      };
    },
    createCallBlob: async request => {
      const { jobId, clusterId } = request.params;
      const body = request.body;

      const machine = request.request.getAuth().isMachine();
      machine.canAccess({ cluster: { clusterId } });

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
    getCall: async request => {
      const { clusterId, jobId } = request.params;

      const auth = request.request.getAuth();
      await auth.canAccess({ cluster: { clusterId } });

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
    createCallApproval: async request => {
      const { clusterId, jobId } = request.params;

      const auth = request.request.getAuth();
      await auth.canManage({ cluster: { clusterId } });

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
  }
);
