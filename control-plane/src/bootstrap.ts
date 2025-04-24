/* eslint-disable @typescript-eslint/no-floating-promises */

import cors from "@fastify/cors";
import { initServer } from "@ts-rest/fastify";
import fastify from "fastify";
import process from "process";
import * as auth from "./modules/auth/auth";
import { pg } from "./modules/data";
import { flagsmith } from "./modules/dependencies/flagsmith";
import * as slack from "./modules/integrations/slack";
import * as jobs from "./modules/jobs/jobs";
import * as models from "./modules/models/routing";
import * as events from "./modules/observability/events";
import { hdx } from "./modules/observability/hyperdx";
import { logContext, logger } from "./modules/observability/logger";
import { addAttributes } from "./modules/observability/tracer";
import * as queues from "./modules/queues/index";
import * as clusters from "./modules/clusters";
import * as redis from "./modules/dependencies/redis";
import * as tools from "./modules/tools";
import * as cron from "./modules/cron";
import { env } from "./utilities/env";
import { runMigrations } from "./utilities/migrate";
import { router } from "./modules/router";

let totalRequestRewrites = 0;

const app = fastify({
  logger: env.ENABLE_FASTIFY_LOGGER,
  rewriteUrl: req => {
    if (!req.url) {
      throw new Error("No URL available in rewriteUrl");
    }

    if (req.url.match(/\/clusters\/.*\/(calls).*$/)) {
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

app.register(initServer().plugin(router), parent => {
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
    done,
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
    tools.start(),
    models.start(),
    redis.start(),
    slack.start(app),
    queues.start(),
    flagsmith?.getEnvironmentFlags(),
    clusters.start(),
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

  if (env.ENVIRONMENT === "dev") {
    // forcibly exit after 1s
    setTimeout(() => {
      console.log("Forcing exit");
      process.exit(0);
    }, 1000);
  }

  await Promise.all([
    app.close(),
    flagsmith?.close(),
    hdx?.shutdown(),
    queues.stop(),
    slack.stop(),
    cron.stop(),
  ]);

  await Promise.all([pg.stop(), redis.stop()]);

  logger.info("Shutdown complete");

  process.exit(0);
});
