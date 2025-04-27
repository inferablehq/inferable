import { FastifyInstance, FastifyRequest } from "fastify";
import { fastifyPlugin } from "fastify-plugin";
import { AuthenticationError } from "../../utilities/errors";
import { clusterExists } from "../clusters";
import * as clusterAuth from "./cluster";
import * as clerkAuth from "./clerk";
import { getRun } from "../runs";
import { env } from "../../utilities/env";

const CLERK_ADMIN_ROLE = "org:admin";

export type Auth = {
  type: "clerk" | "cluster";
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

  const publicRoutes = new Set([
    "POST:/nango/events",
    "GET:/public/oas.json",
    "POST:/ephemeral-setup",
    "GET:/live",
    "GET:/contract",
  ]);

  // Pre-handler hook to extract the auth state from the request and add it to the "auth" decorator property
  fastify.addHook("preHandler", async request => {
    const key = `${request.method}:${request.routerPath}`;
    if (publicRoutes.has(key)) {
      return;
    }

    const authorization = request.headers.authorization;

    const substrings = authorization?.split(" ");
    let token: string | undefined;
    let scheme: string | undefined;

    if (substrings?.length && substrings.length > 1) {
      [scheme, token] = substrings;
      if (scheme?.toLowerCase() !== "bearer") {
        throw new AuthenticationError("Invalid authorization scheme");
      }
    } else {
      token = authorization;
    }

    if (!token) {
      throw new AuthenticationError("No authorization token found");
    }

    const auth = await extractAuthState(token);

    if (!auth) {
      throw new AuthenticationError("Auth not extracted from request");
    }
    request.auth = auth;
  });
});

export const extractAuthState = async (
  token: string,
): Promise<Auth | undefined> => {
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
      } as ClusterKeyAuth;
    }
  }

  if (!env.JWKS_URL) {
    throw new AuthenticationError("JWKS_URL is not set");
  }

  // Check if the token is a Clerk-provided JWT token and validate it.
  const clerkAuthDetails = await clerkAuth.verify(token);

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
    } as ClerkAuth;
  }
};

export const unqualifiedEntityId = (id: string) => {
  const parts = id.split(":");
  if (parts.length > 1) {
    return parts[1];
  }
  return id;
};
