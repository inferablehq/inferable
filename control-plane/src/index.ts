import process from "process";
import { hdx } from "./modules/observability/hyperdx";
import { logger } from "./modules/observability/logger";

process.on("uncaughtException", async err => {
  logger.error("Uncaught exception", { error: err });
  await hdx?.recordException(err);
});

process.on("unhandledRejection", async err => {
  logger.error("Unhandled rejection", { error: err });
  await hdx?.recordException(err);
});

require("./bootstrap");
