#!/usr/bin/env node

import sqlToTextService from "./sql-to-text/service";
import terminalCopilotService from "./terminal-copilot/service";

Promise.all([sqlToTextService.start(), terminalCopilotService.start()]).then(
  () => {
    console.log("🚀 Services started!");
  }
);

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
