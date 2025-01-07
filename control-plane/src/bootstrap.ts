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
import * as email from "./modules/email";
import { logContext, logger } from "./modules/observability/logger";
import * as runs from "./modules/runs";
import * as slack from "./modules/integrations/slack";
import { hdx } from "./modules/observability/hyperdx";
import { pg } from "./modules/data";
import { addAttributes } from "./modules/observability/tracer";
import { flagsmith } from "./modules/flagsmith";
import { runMigrations } from "./utilities/migrate";
import { customerTelemetry } from "./modules/customer-telemetry";

let totalRequestRewrites = 0;

const app = fastify({
  logger: env.ENABLE_FASTIFY_LOGGER,
  rewriteUrl: req => {
    if (!req.url) {
      throw new Error("No URL available in rewriteUrl");
    }

    if (req.url.match(/\/clusters\/.*\/(calls|jobs).*$/)) {
      totalRequestRewrites++;

      // Log every 100th rewrite
      if (totalRequestRewrites % 100 === 0) {
        logger.info("Rewrote request to deprecated /calls endpoint", {
          url: req.url,
          totalRequestRewrites,
        });
      }
      return req.url.replace("/calls", "/jobs");
    }

    return req.url;
  },
});

app.register(auth.plugin);

app.register(initServer().plugin(router.router), parent => {
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

  let docsLink;

  if ("docsLink" in error) {
    docsLink = error.docsLink;
  }

  return reply.status(statusCode).send({
    error: {
      message: statusCode === 500 ? "Internal server error" : error.message,
      docsLink,
    },
  });
});

app.addHook("onRequest", (request, _reply, done) => {
  const attributes = {
    "deployment.version": env.VERSION,
    "cluster.id": request.url.split("clusters/")[1]?.split("/")[0],
    "run.id": request.url.split("run/")[1]?.split("/")[0],
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
    done
  );
});

app.addHook("onResponse", async (request, reply) => {
  if (request.routeOptions.url === "/live" && reply.statusCode >= 400) {
    logger.warn("Live endpoint returned error", {
      statusCode: reply.statusCode,
      path: request.url,
    });
  }
});

const startTime = Date.now();

(async function start() {
  logger.info("Starting server", {
    environment: env.ENVIRONMENT,
    ee: env.EE_DEPLOYMENT,
    headless: !!env.MANAGEMENT_API_SECRET,
  });

  if (env.ENVIRONMENT === "prod") {
    await runMigrations();

    logger.info("Database migrated", { latency: Date.now() - startTime });
  }

  if (!env.EE_DEPLOYMENT) {
    logger.warn("EE_DEPLOYMENT is not set, skipping EE dependencies");
  }

  await Promise.all([
    events.initialize(),
    jobs.start(),
    serviceDefinitions.start(),
    runs.start(),
    models.start(),
    redis.start(),
    slack.start(app),
    externalCalls.start(),
    ...(env.EE_DEPLOYMENT
      ? [
          customerTelemetry.start(),
          toolhouse.start(),
          email.start(),
          flagsmith?.getEnvironmentFlags(),
          analytics.start(),
        ]
      : []),
  ])
    .then(() => {
      logger.info("Dependencies started", { latency: Date.now() - startTime });
    })
    .catch(err => {
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
})().catch(err => {
  logger.error("Failed to start server", { error: err });
  process.exit(1);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down server", {
    uptime: Date.now() - startTime,
    pid: process.pid,
  });

  await Promise.all([
    runs.stop(),
    app.close(),
    flagsmith?.close(),
    hdx?.shutdown(),
    customerTelemetry.stop(),
    externalCalls.stop(),
    slack.stop(),
    email.stop(),
  ]).then(() => {
    pg.stop();
    redis.stop();
  });

  logger.info("Shutdown complete");

  process.exit(0);
});
