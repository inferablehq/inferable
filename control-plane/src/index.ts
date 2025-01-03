import process from "process";
import { hdx } from "./modules/observability/hyperdx";
import { logger } from "./modules/observability/logger";

process.on("uncaughtException", err => {
  logger.error("Uncaught exception", { error: err });
  hdx?.recordException(err);
});

process.on("unhandledRejection", err => {
  logger.error("Unhandled rejection", { error: err });
  hdx?.recordException(err);
});

require("./bootstrap");
