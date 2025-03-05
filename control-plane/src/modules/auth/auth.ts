import { FastifyInstance, FastifyRequest } from "fastify";
import { fastifyPlugin } from "fastify-plugin";
import { AuthenticationError } from "../../utilities/errors";
import { clusterExists, getClusterDetails } from "../clusters";
import * as clusterAuth from "./cluster";
import * as clerkAuth from "./clerk";
import * as customAuth from "./custom";
import { getRun } from "../runs";
import { logger } from "../observability/logger";
import { env } from "../../utilities/env";
import { getJob } from "../jobs/jobs";

const CLERK_ADMIN_ROLE = "org:admin";

export type Auth = {
  type: "clerk" | "cluster" | "custom" | "management";
  entityId: string;
  organizationId: string;
  canAccess(opts: {
    cluster?: {
      clusterId: string;
    };
    job?: {
      clusterId: string;
      jobId: string;
    };
    run?: {
      clusterId: string;
      runId: string;
    };
  }): Promise<Auth>;
  canManage(opts: {
    cluster?: {
      clusterId: string;
    };
    job?: {
      clusterId: string;
      jobId: string;
    };
    run?: {
      clusterId: string;
      runId: string;
    };
  }): Promise<Auth>;
  canCreate(opts: { cluster?: boolean; run?: boolean; call?: boolean }): Auth;
  isMachine(): ClusterKeyAuth;
  isClerk(): ClerkAuth;
  isAdmin(): Auth;
  isCustomAuth(): CustomAuth;
};

export type ClerkAuth = Auth & {
  type: "clerk";
  organizationRole: string;
};

export type ClusterKeyAuth = Auth & {
  type: "cluster";
  clusterId: string;
};

export type ManagementAuth = Auth & {
  type: "management";
  clusterId: string;
};

export type CustomAuth = Auth & {
  type: "custom";
  clusterId: string;
  token: string;
  context: Record<string, unknown>;
};

export const plugin = fastifyPlugin(async (fastify: FastifyInstance) => {
  fastify.decorateRequest("auth");

  // Helper which returns an auth state, rejecting if the required auth state is not present
  fastify.decorateRequest("getAuth", function () {
    const req = this as FastifyRequest;
    if (!req.auth) {
      throw new AuthenticationError("Auth not extracted from request");
    }
    return req.auth;
  });

  // Pre-handler hook to extract the auth state from the request and add it to the "auth" decorator property
  fastify.addHook("preHandler", async request => {
    const authorization = request.headers.authorization;

    const substrings = authorization?.split(" ");
    let token: string | undefined;
    let scheme: string | undefined;

    if (substrings?.length && substrings.length > 1) {
      [scheme, token] = substrings;
    } else {
      token = authorization;
    }

    if (token && scheme?.toLowerCase() === "custom") {
      // @typescript-eslint/no-explicit-any
      const clusterId = (request as any).params["clusterId"];

      if (!clusterId) {
        throw new AuthenticationError(
          `Custom auth can only be used with /clusters/:clusterId paths. Request URL: ${request.url}.`,
        );
      }

      request.auth = await extractCustomAuthState(token, clusterId);
    } else if (token) {
      const auth = await extractAuthState(token);
      request.auth = auth;
    }
  });
});

export const extractAuthState = async (
  token: string,
): Promise<Auth | undefined> => {
  // Management Secret support (Hobby deployments only)
  if (token && token === env.MANAGEMENT_API_SECRET) {
    // This is also validated on startup
    if (env.EE_DEPLOYMENT) {
      throw new Error("Can not use management secret in EE deployment");
    }

    return {
      type: "management",
      entityId: "MANAGEMENT_API_SECRET",
      organizationId: "ROOT",
      canAccess: async function () {
        return this;
      },
      canManage: async function () {
        return this;
      },
      canCreate: function () {
        return this;
      },
      isMachine: function () {
        throw new AuthenticationError(
          "Management API secret auth is not machine",
        );
      },
      isClerk: function () {
        throw new AuthenticationError(
          "Management API secret auth is not clerk",
        );
      },
      isCustomAuth: function () {
        throw new AuthenticationError(
          "Management API secret auth is not custom auth",
        );
      },
      isAdmin: function () {
        return this;
      },
    } as Auth;
  }

  // Check if the token is an API secret and validate it
  if (clusterAuth.isApiSecret(token)) {
    const clusterAuthDetails = await clusterAuth.verify(token);

    if (clusterAuthDetails) {
      return {
        type: "cluster",
        entityId: `cluster:${clusterAuthDetails.id}`,
        clusterId: clusterAuthDetails.clusterId,
        organizationId: clusterAuthDetails.organizationId,
        canAccess: async function (opts) {
          if (!opts.cluster && !opts.run && !opts.job) {
            throw new AuthenticationError("Invalid assertion");
          }

          if (opts.job) {
            if (opts.job.clusterId !== clusterAuthDetails.clusterId) {
              throw new AuthenticationError(
                "API Key does not have access to this cluster",
              );
            }
          }

          if (opts.cluster) {
            if (opts.cluster.clusterId !== this.clusterId) {
              throw new AuthenticationError(
                "API Key does not have access to this cluster",
              );
            }
          }

          if (opts.run) {
            await this.canAccess({
              cluster: { clusterId: opts.run.clusterId },
            });
          }

          return this;
        },
        canManage: async function (opts) {
          if (!opts.cluster && !opts.run && !opts.job) {
            throw new AuthenticationError("Invalid assertion");
          }

          if (opts.cluster) {
            throw new AuthenticationError(
              "API key can not manage this cluster",
            );
          }

          if (opts.job) {
            if (opts.job.clusterId !== clusterAuthDetails.clusterId) {
              throw new AuthenticationError(
                "API Key does not have access to this cluster",
              );
            }
          }

          // API key can manage runs if it has access to the cluster
          if (opts.run) {
            await this.canAccess({
              cluster: { clusterId: opts.run.clusterId },
            });
          }

          return this;
        },
        canCreate: function (opts) {
          if (!opts.cluster && !opts.run && !opts.call) {
            throw new AuthenticationError("Invalid assertion");
          }

          // API Key cannot create clusters
          if (opts.cluster) {
            throw new AuthenticationError("API key can not create cluster");
          }

          // API Key can create templates / runs and calls
          return this;
        },
        isMachine: function () {
          return this;
        },
        isAdmin: function () {
          throw new AuthenticationError("API key is not admin");
        },
        isClerk: function () {
          throw new AuthenticationError("API key is not user");
        },
        isCustomAuth: function () {
          throw new AuthenticationError("API key is not custom auth");
        },
      } as ClusterKeyAuth;
    }
  }

  // Check if the token is a Clerk-provided JWT token and validate it.
  const clerkAuthDetails = env.JWKS_URL
    ? await clerkAuth.verify(token)
    : undefined;

  if (clerkAuthDetails) {
    return {
      type: "clerk",
      entityId: `clerk:${clerkAuthDetails.userId}`,
      organizationId: clerkAuthDetails.orgId,
      organizationRole: clerkAuthDetails.orgRole,
      canAccess: async function (opts) {
        if (!opts.cluster && !opts.run && !opts.job) {
          throw new AuthenticationError("Invalid assertion");
        }

        const clusterId =
          opts.cluster?.clusterId ??
          (opts.run?.clusterId as string) ??
          (opts.job?.clusterId as string);

        // First check the cluster
        if (
          !(await clusterExists({
            organizationId: clerkAuthDetails.orgId,
            clusterId,
          }))
        ) {
          throw new AuthenticationError(
            "User does not have access to the cluster",
          );
        }

        // If the User has access to the cluster, they also have access to the run

        return this;
      },
      canManage: async function (opts) {
        if (!opts.cluster && !opts.run && !opts.job) {
          throw new AuthenticationError("Invalid assertion");
        }

        if (opts.cluster) {
          this.isAdmin();

          await this.canAccess({
            cluster: { clusterId: opts.cluster.clusterId },
          });
        }

        if (opts.run) {
          await this.canAccess({
            cluster: { clusterId: opts.run.clusterId },
          });
          const run = await getRun({
            clusterId: opts.run.clusterId,
            runId: opts.run.runId,
          });

          if (run.userId !== this.entityId) {
            // Only admins can manage other users' workflows
            this.isAdmin();
          }
        }

        if (opts.job) {
          await this.canAccess({
            cluster: { clusterId: opts.job.clusterId },
          });
        }

        return this;
      },
      canCreate: function (opts) {
        if (!opts.cluster && !opts.run && !opts.call) {
          throw new AuthenticationError("Invalid assertion");
        }

        // Admins can create clusters
        if (opts.cluster) {
          this.isAdmin();
        }

        // All users can create runs and calls (for now)
        return this;
      },
      isAdmin: function () {
        if (this.organizationRole !== CLERK_ADMIN_ROLE) {
          throw new AuthenticationError(
            "User is not an admin of the organization",
          );
        }
        return this;
      },
      isMachine: function () {
        throw new AuthenticationError("Clerk auth is not machine");
      },
      isClerk: function () {
        return this;
      },
      isCustomAuth: function () {
        throw new AuthenticationError("User is not custom auth");
      },
    } as ClerkAuth;
  }
};

export const extractCustomAuthState = async (
  token: string,
  clusterId: string,
): Promise<CustomAuth | undefined> => {
  const cluster = await getClusterDetails(clusterId);

  if (!!cluster.deleted_at) {
    return undefined;
  }

  if (!cluster.organization_id) {
    logger.warn("Recieved custom auth for cluster without organization", {
      clusterId,
    });
    return undefined;
  }

  if (!cluster.enable_custom_auth) {
    throw new AuthenticationError(
      "Custom auth is not enabled for this cluster",
      "https://docs.inferable.ai/pages/custom-auth",
    );
  }

  const context = await customAuth.verify({
    token: token,
    clusterId: clusterId,
  });

  return {
    type: "custom",
    entityId: `custom:${context.userId}`,
    clusterId,
    organizationId: cluster.organization_id,
    token,
    context,
    canAccess: async function (opts) {
      if (!opts.cluster && !opts.run && !opts.job) {
        throw new AuthenticationError("Invalid assertion");
      }

      if (opts.cluster && opts.cluster.clusterId !== clusterId) {
        throw new AuthenticationError(
          "Custom auth does not have access to this cluster",
        );
      }

      if (opts.run && opts.run.clusterId !== clusterId) {
        throw new AuthenticationError(
          "Custom auth does not have access to this run",
        );
      }

      if (opts.job && opts.job.clusterId !== clusterId) {
        throw new AuthenticationError(
          "Custom auth does not have access to this job",
        );
      }

      if (opts.run) {
        const existingRun = await getRun({
          clusterId: opts.run.clusterId,
          runId: opts.run.runId,
        });

        if (!existingRun) {
          throw new AuthenticationError(
            "Custom auth does not have access to this run",
          );
        }

        if (existingRun.userId !== this.entityId) {
          throw new AuthenticationError(
            "Custom auth does not have access to this run",
          );
        }
      }

      if (opts.job) {
        const job = await getJob({
          clusterId: opts.job.clusterId,
          jobId: opts.job.jobId,
        });

        if (!job || !job.runId) {
          throw new AuthenticationError(
            "Custom auth does not have access to this job",
          );
        }

        const existingRun = await getRun({
          clusterId: opts.job.clusterId,
          runId: job.runId,
        });

        if (!existingRun) {
          throw new AuthenticationError(
            "Custom auth does not have access to this job",
          );
        }

        if (existingRun.userId !== this.entityId) {
          throw new AuthenticationError(
            "Custom auth does not have access to this job",
          );
        }
      }

      return this;
    },
    canManage: async function (opts) {
      if (!opts.cluster && !opts.run) {
        throw new AuthenticationError("Invalid assertion");
      }

      if (opts.cluster) {
        throw new AuthenticationError("Custom auth can not manage clusters");
      }

      if (opts.run && opts.run.clusterId !== clusterId) {
        throw new AuthenticationError(
          "Custom auth does not have access to this run",
        );
      }

      if (!opts.run && !opts.job) {
        throw new AuthenticationError(
          "Custom auth can only manage runs and jobs",
        );
      }

      if (opts.run) {
        await this.canAccess({
          run: {
            clusterId: opts.run.clusterId,
            runId: opts.run.runId,
          },
        });
      }

      if (opts.job) {
        await this.canAccess({
          job: {
            clusterId: opts.job.clusterId,
            jobId: opts.job.jobId,
          },
        });
      }

      return this;
    },
    canCreate: function (opts) {
      if (!opts.cluster && !opts.run && !opts.call) {
        throw new AuthenticationError("Invalid assertion");
      }

      if (opts.cluster) {
        throw new AuthenticationError("Custom auth can not create clusters");
      }

      if (opts.call) {
        throw new AuthenticationError("Custom auth can not create calls");
      }

      // Can create runs
      return this;
    },
    isAdmin: function () {
      throw new AuthenticationError("Custom auth is not admin");
    },
    isMachine: function () {
      throw new AuthenticationError("Custom auth is not machine");
    },
    isClerk: function () {
      throw new AuthenticationError("Custom auth is not clerk");
    },
    isCustomAuth: function () {
      return this;
    },
  } as CustomAuth;
};

export const unqualifiedEntityId = (id: string) => {
  const parts = id.split(":");
  if (parts.length > 1) {
    return parts[1];
  }
  return id;
};
