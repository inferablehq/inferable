import { env } from "./utilities/env";
import cors from "@fastify/cors";
import { initServer } from "@ts-rest/fastify";
import fastify from "fastify";
import process from "process";
import * as auth from "./modules/auth/auth";
import * as analytics from "./modules/analytics";
import * as jobs from "./modules/jobs/jobs";
import * as serviceDefinitions from "./modules/service-definitions";
import * as events from "./modules/observability/events";
import * as router from "./modules/router";
import * as redis from "./modules/redis";
import * as toolhouse from "./modules/integrations/toolhouse";
import * as externalCalls from "./modules/jobs/external";
import * as models from "./modules/models/routing";
import { logContext, logger } from "./modules/observability/logger";
import * as workflows from "./modules/workflows/workflows";
import { hdx } from "./modules/observability/hyperdx";
import { pg } from "./modules/data";
import { addAttributes } from "./modules/observability/tracer";
import { flagsmith } from "./modules/flagsmith";
import { runMigrations } from "./utilities/migrate";
import { customerTelemetry } from "./modules/customer-telemetry";

const app = fastify({
  logger: env.ENABLE_FASTIFY_LOGGER,
});

app.register(auth.plugin);

app.register(initServer().plugin(router.router), (parent) => {
  return parent;
});

const allowedOrigins = [env.APP_ORIGIN];

const corsBypassRegex = new RegExp(/\/clusters\/.*\/runs/);

app.register(cors, {
  delegator: (req, callback) => {
    if (allowedOrigins.includes(req.headers.origin ?? "")) {
      callback(null, {
        origin: true,
      });
      return;
    }

    if (corsBypassRegex.test(req.url ?? "")) {
      callback(null, {
        origin: true,
      });
      return;
    }

    callback(null, {
      origin: false,
    });
  },
});

app.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  const alertable = statusCode >= 500;

  if (alertable) {
    logger.error(error.message, {
      path: request.routeOptions.url,
      ...error,
      stack: error.stack ?? "No stack trace",
    });

    hdx?.recordException(error);
  }

  return reply.status(statusCode).send({
    error: {
      message: statusCode === 500 ? "Internal server error" : error.message,
    },
  });
});

app.addHook("onRequest", (request, _reply, done) => {
  const attributes = {
    "deployment.version": env.VERSION,
    "cluster.id": request.url.split("clusters/")[1]?.split("/")[0],
    "workflow.id": request.url.split("workflows/")[1]?.split("/")[0],
    "machine.id": request.headers["x-machine-id"],
    "machine.sdk.version": request.headers["x-machine-sdk-version"],
    "machine.sdk.language": request.headers["x-machine-sdk-language"],
  };

  addAttributes(attributes);

  // Start a new logger context for the request
  logContext.run(
    {
      ...attributes,
      // No need to add these to the attributes as they should already be present on the span
      // But we also want them in the log context
      request: {
        id: request.id,
        path: request.routeOptions.url,
        method: request.method,
      },
    },
    done,
  );
});

const startTime = Date.now();

(async function start() {
  logger.info("Starting server", {
    environment: env.ENVIRONMENT,
    ee: env.EE_DEPLOYMENT,
    headless: !!env.MANAGEMENT_API_SECRET
  });

  if (env.ENVIRONMENT === "prod") {
    await runMigrations()

    logger.info("Database migrated", { latency: Date.now() - startTime });
  }

  await Promise.all([
    events.initialize(),
    jobs.start(),
    serviceDefinitions.start(),
    workflows.start(),
    models.start(),
    redis.start(),
    customerTelemetry.start(),
    toolhouse.start(),
    externalCalls.start(),
    ...(env.EE_DEPLOYMENT
      ? [
          flagsmith?.getEnvironmentFlags(),
          analytics.start(),
        ]
      : []),
  ])
    .then(() => {
      logger.info("Dependencies started", { latency: Date.now() - startTime });
    })
    .catch((err) => {
      logger.error("Failed to start dependencies", { error: err });
      process.exit(1);
    });

  try {
    await app.listen({ port: 4000, host: "0.0.0.0" });
  } catch (err) {
    logger.error("Failed to start server", { error: err });
    process.exit(1);
  }

  logger.info("Server started", {
    pid: process.pid,
    port: 4000,
    latency: Date.now() - startTime,
  });
})();

process.on("SIGTERM", async () => {
  logger.info("Shutting down server", {
    uptime: Date.now() - startTime,
    pid: process.pid,
  });

  await Promise.all([
    workflows.stop(),
    app.close(),
    pg.stop(),
    flagsmith?.close(),
    hdx?.shutdown(),
    redis.stop(),
    customerTelemetry.stop(),
    externalCalls.stop(),
  ]);

  logger.info("Shutdown complete");

  process.exit(0);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err });
  hdx?.recordException(err);
});

process.on("unhandledRejection", (err) => {
  logger.error("Unhandled rejection", { error: err });
  hdx?.recordException(err);
});
