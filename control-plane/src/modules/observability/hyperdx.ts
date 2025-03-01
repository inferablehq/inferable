import { env } from "../../utilities/env";

import * as HyperDX from "@hyperdx/node-opentelemetry";

export const hdx = env.HYPERDX_API_KEY ? HyperDX : null;

if (!hdx && env.NODE_ENV === "production") {
  // eslint-disable-next-line no-console
  console.log("HyperDX is not configured");
}

// https://github.com/hyperdxio/hyperdx/pull/482/files#diff-640421119b98d79387943d72e9c73533ab992fac090060f88ce895e4917c5d2c
process.env.OTEL_RESOURCE_ATTRIBUTES = `deployment.environment=${env.ENVIRONMENT}`;

hdx?.init({
  apiKey: env.HYPERDX_API_KEY,
  service: `control-plane`,
  instrumentations: {
    "@opentelemetry/instrumentation-http": {
      enabled: true,
    },
    "@opentelemetry/instrumentation-pg": {
      enabled: true,
      // This is to prevent tracking new spans for every `/calls` request
      requireParentSpan: true,
    },
    "@opentelemetry/instrumentation-redis": {
      enabled: true,
    },
  },
  advancedNetworkCapture: false,
  disableLogs: true,
  disableStartupLogs: true,
  stopOnTerminationSignals: false,
});
