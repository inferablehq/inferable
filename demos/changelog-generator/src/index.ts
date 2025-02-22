/// <reference types="node" />

import { inferable } from "./inferable";
import { tools } from "./tools/git";
import { workflow } from "./workflows/summarize";
import crypto from "crypto";

async function main() {
  await Promise.all([tools.listen(), workflow.listen()]);

  console.log("Workflows and tools listening");

  inferable.workflows.trigger("summarize", {
    executionId: crypto.randomUUID(),
  });
}

main();
