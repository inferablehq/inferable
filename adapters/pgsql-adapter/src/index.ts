#!/usr/bin/env node

import { Inferable } from "inferable";
import { InferablePGSQLAdapter } from "./postgres/postgres";
import yargs, { describe } from "yargs";
import { hideBin } from "yargs/helpers";
import pg from "pg";

// Export the adapter for library usage
export { InferablePGSQLAdapter };

// CLI entrypoint
if (require.main === module) {
  (async function main() {
    // Configure yargs
    const argv = await yargs(hideBin(process.argv))
      .usage("$0 <connectionString> [options]")
      .positional("connectionString", {
        describe: "PostgreSQL connection string",
        type: "string",
        demandOption: true,
      })
      .option("approval-mode", {
        type: "string",
        describe:
          'Approval mode: "always" (all queries), "mutate" (only data-modifying queries), or "off"',
        choices: ["always", "mutate", "off"],
        default: "always",
      })
      .option("privacy-mode", {
        type: "boolean",
        describe:
          "Enable privacy mode. All data will be returned as blobs (not sent to the model)",
        default: false,
      })
      .option("schema", {
        type: "string",
        describe: "Database schema to use",
        default: "public",
      })
      .option("secret", {
        type: "string",
        describe: "Inferable API cluster secret",
      })
      .option("endpoint", {
        type: "string",
        describe: "Inferable API endpoint",
      })
      .options("test", {
        describe: "Check that the connection string is valid and exit",
        type: "boolean",
        default: false,
      })
      .help()
      .alias("help", "h").argv;

    try {
      const {
        "approval-mode": approvalMode,
        "privacy-mode": privacyMode,
        test,
        schema,
        endpoint,
        secret,
      } = argv as any;
      const [connectionString] = argv._;

      if (!connectionString) {
        console.error("Connection string is required");
        process.exit(1);
      }

      const client = new Inferable({
        apiSecret: secret,
        endpoint: endpoint,
      });

      const adapter = new InferablePGSQLAdapter({
        connectionString: String(connectionString),
        approvalMode,
        privacyMode,
        schema,
      });

      await adapter.initialize();

      if (test) {
        console.log("Connection test successful");
        process.exit(0);
      }

      adapter.register(client);

      client.tools.listen();
    } catch (err: unknown) {
      console.error("Unexpected Error:", err);
      process.exit(1);
    }
  })();
}
