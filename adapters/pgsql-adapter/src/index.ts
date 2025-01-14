#!/usr/bin/env node

import { Inferable } from "inferable";
import { InferablePGSQLAdapter } from "./postgres/postgres";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Export the adapter for library usage
export { InferablePGSQLAdapter };

// CLI entrypoint
if (require.main === module) {
  (async function main() {
    // Configure yargs
    const argv = await yargs(hideBin(process.argv))
      .usage('$0 <connectionString> [options]')
      .positional('connectionString', {
        describe: 'PostgreSQL connection string',
        type: 'string',
        demandOption: true,
      })
      .option('approvalMode', {
        type: 'string',
        describe: 'Approval mode: "always" (all queries), "mutate" (only data-modifying queries), or "off"',
        choices: ['always', 'mutate', 'off'],
        default: 'always',
      })
      .option('privacyMode', {
        type: 'boolean',
        describe: 'Enable privacy mode. All data will be returned as blobs (not sent to the model)',
        default: false,
      })
      .option('schema', {
        type: 'string',
        describe: 'Database schema to use',
        default: 'public',
      })
      .option('secret', {
        type: 'string',
        describe: 'Inferable API cluster secret',
      })
      .option('endpoint', {
        type: 'string',
        describe: 'Inferable API endpoint',
      })
      .help()
      .alias('help', 'h')
      .argv;

    try {
      const { approvalMode, privacyMode, schema, endpoint, secret } = argv as any;
      const [ connectionString ] = argv._;

      if (!connectionString) {
        console.error('Connection string is required');
        process.exit(1);
      }

      const client = new Inferable({
        apiSecret: secret,
        endpoint: endpoint
      });

      const adapter = new InferablePGSQLAdapter({
        connectionString: String(connectionString),
        approvalMode,
        privacyMode,
        schema,
      });

      await adapter.initialize();
      const service = adapter.createService(client);

      await service.start();

      process.on('SIGTERM', async () => {
        await service.stop();
      });
    } catch (err: unknown) {
      console.error('Unexpected Error:', err);
      process.exit(1);
    }
  })();
}
