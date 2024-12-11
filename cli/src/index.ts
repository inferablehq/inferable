#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import updateNotifier from "simple-update-notifier";
import pkg from "../package.json";
import { Auth } from "./commands/auth";
import { Cli } from "./commands/cli";
import { Clusters } from "./commands/clusters";
import { Shell } from "./commands/shell";
import { Bootstrap } from "./commands/bootstrap";
import { Runs } from "./commands/runs";
import { Generate } from "./commands/generate";
import { AppOpen } from "./commands/open";

// Check for updates and notify
updateNotifier({ 
  pkg: pkg, 
  updateCheckInterval: 1000 * 60 * 60 * 24,
  shouldNotifyInNpmScript: true, 
});

const cli = yargs(hideBin(process.argv))
  .scriptName("@inferable/cli")
  .strict()
  .hide("version")
  .demandCommand()
  .command(Auth)
  .command(Shell)
  .command(Cli)
  .command(Bootstrap)
  .command(Generate)
  .command(Clusters)
  .command(Runs)
  .command(AppOpen);

cli.argv;
