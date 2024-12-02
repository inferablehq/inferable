import "dotenv/config";

import { Inferable } from "inferable";
import { PostgresClient } from "./postgres";
import { RegisteredService } from "inferable/bin/types";
import { OpenAPIClient } from "./open-api";

const parseConfig = () => {
  const config = require("../config.json");

  config.connectors.forEach((connector: any) => {
    for (const [key, value] of Object.entries(connector)) {
      if (typeof value === "string" && value.startsWith("process.env.")) {
        const actual = process.env[value.replace("process.env.", "")];
        if (!actual) {
          throw new Error(`Environment variable ${value} not found`);
        }
        connector[key] = actual;
      }
    }
  });

  return config;
};

(async function main() {
  const client = new Inferable();

  const config = parseConfig();

  if (config.connectors.length === 0) {
    throw new Error("No connectors found in config.json");
  }

  // TODO: Inherited interfaces
  const services: RegisteredService[] = [];

  for (const connector of config.connectors) {
    if (connector.type === "postgres") {
      const postgresClient = new PostgresClient({
        ...connector,
        paranoidMode: config.paranoidMode === 1,
        privacyMode: config.privacyMode === 1,
      });
      const service = postgresClient.createService(client);
      services.push(service);
    } else if (connector.type === "open-api") {
      const openAPIClient = new OpenAPIClient({
        ...connector,
        paranoidMode: config.paranoidMode === 1,
        privacyMode: config.privacyMode === 1,
      });
      const service = openAPIClient.createService(client);
      services.push(service);
    }
  }

  if (services.length === 0) {
    throw new Error("No services found in config.json");
  }

  for (const service of services) {
    await service.start();
  }

  process.on("SIGTERM", async () => {
    for (const service of services) {
      await service.stop();
    }
  });
})();
