#!/usr/bin/env node

import { register as registerSqlToText } from "./sql-to-text/service";
import { register as registerTerminalCopilot } from "./terminal-copilot/service";
import { apiSecret } from "./secret";
import { Inferable } from "inferable";

const client = new Inferable({
  apiSecret,
});

registerSqlToText(client);
registerTerminalCopilot(client);

client.tools.listen();

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
