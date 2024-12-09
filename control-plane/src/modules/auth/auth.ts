import { FastifyInstance, FastifyRequest } from "fastify";
import { fastifyPlugin } from "fastify-plugin";
import { AuthenticationError } from "../../utilities/errors";
import { clusterExists, getClusterDetails } from "../cluster";
import * as apiSecret from "./api-secret";
import * as jwt from "./clerk-token";
import { getRunCustomerAuthToken, getWorkflow } from "../workflows/workflows";
import { logger } from "../observability/logger";
import { verifyCustomerProvidedAuth } from "./customer-auth";
import { env } from "../../utilities/env";

const CLERK_ADMIN_ROLE = "org:admin";

export type Auth = {
  type: "clerk" | "api" | "customer-provided";
  entityId: string;
  organizationId: string;
  canAccess(opts: {
    cluster?: {
      clusterId: string;
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
    run?: {
      clusterId: string;
      runId: string;
    };
    config?: {
      clusterId: string;
      configId: string;
    };
  }): Promise<Auth>;
  canCreate(opts: {
    cluster?: boolean;
    run?: boolean;
    config?: boolean;
    call?: boolean;
  }): Auth;
  isMachine(): ApiKeyAuth;
  isClerk(): ClerkAuth;
  isAdmin(): Auth;
  isCustomerProvided(): CustomerProvidedAuth;
};

export type ClerkAuth = Auth & {
  type: "clerk";
  organizationRole: string;
};

export type ApiKeyAuth = Auth & {
  type: "api";
  clusterId: string;
};

export type CustomerProvidedAuth = Auth & {
  type: "customer-provided";
  clusterId: string;
  token: string;
  context: unknown;
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
  fastify.addHook("preHandler", async (request) => {
    const authorization = request.headers.authorization;

    const substrings = authorization?.split(" ");
    let token: string | undefined;
    let scheme: string | undefined;

    if (substrings?.length && substrings.length > 1) {
      [scheme, token] = substrings;
    } else {
      token = authorization;
    }

    if (token && scheme?.toLowerCase() === "customer") {
      // @typescript-eslint/no-explicit-any
      const clusterId = (request as any).params["clusterId"];

      if (!clusterId) {
        throw new AuthenticationError(
          "Customer provided auth can only be used with /clusters/:clusterId paths",
        );
      }

      request.auth = await extractCustomerAuthState(token, clusterId);
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
      type: "api",
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
        throw new AuthenticationError("Management API secret auth is not machine");
      },
      isClerk: function () {
        throw new AuthenticationError("Management API secret auth is not clerk");
      },
      isCustomerProvided: function () {
        throw new AuthenticationError(
          "Management API secret auth is not customer provided",
        );
      },
      isAdmin: function () {
        return this;
      },
    } as Auth;
  }

  // Check if the token is an API secret and validate it
  if (apiSecret.isApiSecret(token)) {
    const machineAuth = await apiSecret.verifyApiKey(token);

    if (machineAuth) {
      return {
        type: "api",
        entityId: machineAuth.id,
        clusterId: machineAuth.clusterId,
        organizationId: machineAuth.organizationId,
        canAccess: async function (opts) {
          if (!opts.cluster && !opts.run) {
            throw new AuthenticationError("Invalid assertion");
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
          if (!opts.cluster && !opts.run && !opts.config) {
            throw new AuthenticationError("Invalid assertion");
          }

          if (opts.cluster) {
            throw new AuthenticationError(
              "API key can not manage this cluster",
            );
          }

          // API key can manage runs if it has access to the cluster
          if (opts.run) {
            await this.canAccess({
              cluster: { clusterId: opts.run.clusterId },
            });
          }

          // API key can manage templates if it has access to the cluster
          if (opts.config) {
            await this.canAccess({
              cluster: { clusterId: opts.config.clusterId },
            });
          }

          return this;
        },
        canCreate: function (opts) {
          if (!opts.cluster && !opts.run && !opts.config && !opts.call) {
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
        isCustomerProvided: function () {
          throw new AuthenticationError("API key is not customer provided");
        },
      } as ApiKeyAuth;
    }
  }

  // Check if the token is a Clerk-provided JWT token and validate it.
  const clerkAuth = env.JWKS_URL
    ? await jwt.verifyClerkToken(token)
    : undefined;

  if (clerkAuth) {
    return {
      type: "clerk",
      entityId: clerkAuth.userId,
      organizationId: clerkAuth.orgId,
      organizationRole: clerkAuth.orgRole,
      canAccess: async function (opts) {
        if (!opts.cluster && !opts.run) {
          throw new AuthenticationError("Invalid assertion");
        }

        const clusterId =
          opts.cluster?.clusterId ?? (opts.run?.clusterId as string);

        // First check the cluster
        if (
          !(await clusterExists({
            organizationId: clerkAuth.orgId,
            clusterId,
          }))
        ) {
          throw new AuthenticationError(
            "User does not have access to the cluster",
          );
        }

        // If the User has access to the cluster, they also have access to the workflow

        return this;
      },
      canManage: async function (opts) {
        if (!opts.cluster && !opts.run && !opts.config) {
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
          const workflow = await getWorkflow({
            clusterId: opts.run.clusterId,
            runId: opts.run.runId,
          });

          if (workflow.userId !== this.entityId) {
            // Only admins can manage other users' workflows
            this.isAdmin();
          }
        }

        if (opts.config) {
          await this.canAccess({
            cluster: { clusterId: opts.config.clusterId },
          });

          // Only admins can manage templates
          this.isAdmin();
        }

        return this;
      },
      canCreate: function (opts) {
        if (!opts.cluster && !opts.run && !opts.config && !opts.call) {
          throw new AuthenticationError("Invalid assertion");
        }

        // Admins can create clusters
        if (opts.cluster) {
          this.isAdmin();
        }

        // Admins can create templates
        if (opts.config) {
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
      isCustomerProvided: function () {
        throw new AuthenticationError("User is not customer provided auth");
      },
    } as ClerkAuth;
  }
};

export const extractCustomerAuthState = async (
  token: string,
  clusterId: string,
): Promise<CustomerProvidedAuth | undefined> => {
  const cluster = await getClusterDetails(clusterId);

  if (!!cluster.deleted_at) {
    return undefined;
  }

  if (!cluster.organization_id) {
    logger.warn(
      "Recieved customer provided auth for cluster without organization",
      {
        clusterId,
      },
    );
    return undefined;
  }

  if (!cluster.enable_customer_auth) {
    throw new AuthenticationError(
      "Customer auth is not enabled for this cluster",
    );
  }

  const context = await verifyCustomerProvidedAuth({
    token: token,
    clusterId: clusterId,
  });

  return {
    type: "customer-provided",
    entityId: "CUSTOMER_PROVIDED_AUTH",
    clusterId,
    organizationId: cluster.organization_id,
    token,
    context,
    canAccess: async function (opts) {
      if (!opts.cluster && !opts.run) {
        throw new AuthenticationError("Invalid assertion");
      }

      if (opts.cluster && opts.cluster.clusterId !== clusterId) {
        throw new AuthenticationError(
          "Customer provided auth does not have access to this cluster",
        );
      }

      if (opts.run && opts.run.clusterId !== clusterId) {
        throw new AuthenticationError(
          "Customer provided auth does not have access to this run",
        );
      }

      if (opts.run) {
        const customerAuthToken = await getRunCustomerAuthToken({
          clusterId: opts.run.clusterId,
          runId: opts.run.runId,
        });

        if (!customerAuthToken) {
          throw new AuthenticationError(
            "Customer provided auth can only access runs created by customer provided auth",
          );
        }

        if (customerAuthToken !== this.token) {
          throw new AuthenticationError(
            "Customer Auth does not have access to this run",
          );
        }
      }

      return this;
    },
    canManage: async function (opts) {
      if (!opts.cluster && !opts.run && !opts.config) {
        throw new AuthenticationError("Invalid assertion");
      }

      if (opts.cluster) {
        throw new AuthenticationError(
          "Customer provided auth can not manage clusters",
        );
      }

      if (opts.config) {
        throw new AuthenticationError(
          "Customer provided auth can not manage templates",
        );
      }

      if (opts.run && opts.run.clusterId !== clusterId) {
        throw new AuthenticationError(
          "Customer Auth does not have access to this run",
        );
      }

      if (!opts.run) {
        throw new AuthenticationError(
          "Customer provided auth can only manage runs",
        );
      }

      const customerAuthToken = await getRunCustomerAuthToken({
        clusterId: opts.run.clusterId,
        runId: opts.run.runId,
      });

      if (!customerAuthToken) {
        throw new AuthenticationError(
          "Customer provided auth can only access runs created by customer provided auth",
        );
      }

      if (customerAuthToken !== this.token) {
        throw new AuthenticationError(
          "Customer Auth does not have access to this run",
        );
      }

      return this;
    },
    canCreate: function (opts) {
      if (!opts.cluster && !opts.run && !opts.config && !opts.call) {
        throw new AuthenticationError("Invalid assertion");
      }

      if (opts.cluster) {
        throw new AuthenticationError(
          "Customer provided auth can not create clusters",
        );
      }

      if (opts.config) {
        throw new AuthenticationError(
          "Customer provided auth can not create templates",
        );
      }

      if (opts.call) {
        throw new AuthenticationError(
          "Customer provided auth can not create calls",
        );
      }

      // Can create runs
      return this;
    },
    isAdmin: function () {
      throw new AuthenticationError("Customer provided auth is not admin");
    },
    isMachine: function () {
      throw new AuthenticationError("Customer provided auth is not machine");
    },
    isClerk: function () {
      throw new AuthenticationError("Customer provided auth is not clerk");
    },
    isCustomerProvided: function () {
      return this;
    },
  } as CustomerProvidedAuth;
};
