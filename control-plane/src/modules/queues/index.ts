import { emailIngestionQueue } from "./email-ingestion";
import { externalToolCallQueue } from "./external-tool-call";
import { customerTelemetryQueue } from "./customer-telemetry";
import { runProcessQueue } from "./run-process";
import { runGenerateNameQueue } from "./run-name-generation";

export const start = async () => {
  await Promise.all([
    emailIngestionQueue.start(),
    externalToolCallQueue.start(),
    customerTelemetryQueue.start(),
    runProcessQueue.start(),
    runGenerateNameQueue.start(),
  ]);
};

export const stop = async () => {
  await Promise.all([
    emailIngestionQueue.stop(),
    externalToolCallQueue.stop(),
    customerTelemetryQueue.stop(),
    runProcessQueue.stop(),
    runGenerateNameQueue.stop(),
  ]);
};
