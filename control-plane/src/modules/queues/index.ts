import { customerTelemetryQueue } from "./customer-telemetry";
import { runProcessQueue } from "./run-process";

export const start = async () => {
  await Promise.all([
    customerTelemetryQueue.start(),
    runProcessQueue.start(),
  ]);
};

export const stop = async () => {
  await Promise.all([
    customerTelemetryQueue.stop(),
    runProcessQueue.stop(),
  ]);
};
