#!/usr/bin/env node

import 'dotenv/config';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const argv = await yargs(hideBin(process.argv))
  .option('cluster-id', {
    type: 'string',
    default: process.env.INFERABLE_CLUSTER_ID,
    description: 'Inferable cluster ID'
  })
  .option('api-secret', {
    type: 'string',
    default: process.env.INFERABLE_API_SECRET,
    description: 'Inferable API secret'
  })
  .option('agent-id', {
    type: 'string',
    default: process.env.INFERABLE_AGENT_ID,
    description: 'Agent ID to use'
  })
  .option('run-id', {
    type: 'string',
    default: process.env.INFERABLE_RUN_ID,
    description: 'Existing run ID to resume'
  })
  .parse();

await import('./cli.js').then(({ runCLI }) => runCLI(argv));
