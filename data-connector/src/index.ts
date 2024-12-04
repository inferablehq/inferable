import "dotenv/config";

import { Inferable } from "inferable";
import { PostgresClient } from "./postgres/postgres";
import { RegisteredService } from "inferable/bin/types";
import { OpenAPIClient } from "./open-api/open-api";
import { GraphQLClient } from "./graphql/graphql";
import { MySQLClient } from "./mysql/mysql";
import { SQLiteClient } from "./sqlite/sqlite";

const parseConfig = (connector: any) => {
  for (const [key, value] of Object.entries(connector)) {
    if (typeof value === "object") {
      const config = parseConfig(value);
      if (!config) {
        delete connector[key];
        console.warn(
          `Connector ${key} has invalid configuration. It will be skipped.`,
        )
      }

      connector[key] = config;
    } else if (typeof value === "string" && value.startsWith("process.env.")) {
      const actual = process.env[value.replace("process.env.", "")];
      if (!actual) {
        console.warn(`Environment variable ${value} not found.`);
        return;
      }
      connector[key] = actual;
    }
  }

  return connector;
};

(async function main() {
  const client = new Inferable();

  const config = require("../config.json");
  config.connectors = parseConfig(config.connectors);

  if (config.connectors.length === 0) {
    throw new Error("No connectors found in config.json");
  }

  // TODO: Inherited interfaces
  const services: RegisteredService[] = [];

  for (const connector of config.connectors) {
    if (!connector) {
      continue;
    }

    if (!!connector.maxResultLength && isNaN(Number(connector.maxResultLength))) {
      throw new Error("maxResultLength must be a number");
    }

    if (connector.type === "postgres") {
      const postgresClient = new PostgresClient({
        paranoidMode: config.paranoidMode === 1,
        privacyMode: config.privacyMode === 1,
        maxResultLength: Number(config.maxResultLength),
        ...connector,
      });
      await postgresClient.initialize();
      const service = postgresClient.createService(client);
      services.push(service);
    } else if (connector.type === "open-api") {
      const openAPIClient = new OpenAPIClient({
        paranoidMode: config.paranoidMode === 1,
        privacyMode: config.privacyMode === 1,
        maxResultLength: Number(config.maxResultLength),
        ...connector,
      });
      await openAPIClient.initialize();
      const service = openAPIClient.createService(client);
      services.push(service);
    } else if (connector.type === "graphql") {
      const graphQLClient = new GraphQLClient({
        paranoidMode: config.paranoidMode === 1,
        privacyMode: config.privacyMode === 1,
        maxResultLength: Number(config.maxResultLength),
        ...connector,
      });
      await graphQLClient.initialize();
      const service = graphQLClient.createService(client);
      services.push(service);
    } else if (connector.type === "mysql") {
      const mysqlClient = new MySQLClient({
        paranoidMode: config.paranoidMode === 1,
        privacyMode: config.privacyMode === 1,
        maxResultLength: Number(config.maxResultLength),
        ...connector,
      });
      await mysqlClient.initialize();
      const service = mysqlClient.createService(client);
      services.push(service);
    } else if (connector.type === "sqlite") {
      const sqliteClient = new SQLiteClient({
        paranoidMode: config.paranoidMode === 1,
        privacyMode: config.privacyMode === 1,
        maxResultLength: Number(config.maxResultLength),
        ...connector,
      });
      await sqliteClient.initialize();
      const service = sqliteClient.createService(client);
      services.push(service);
    } else {
      throw new Error(`Unknown connector type: ${connector.type}`);
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
