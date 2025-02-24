/// <reference types="node" />

import { inferable } from "./inferable";
import { tools } from "./tools";
import { quoteRequestWorkflow } from "./workflow";

async function main() {
  await Promise.all([tools.listen(), quoteRequestWorkflow.listen()]);

  console.log("Workflows and tools listening");

  // Example trigger for testing
  const customerEmail = "customer@example.com";
  const emailBody =
    "I need a quote for 5 Enterprise Widgets with rush delivery, and 2 Premium Gadgets";
  const backOfficeEmail = "quotes@company.com";

  inferable.workflows.trigger("quoteRequest", {
    executionId: `quote-${Date.now()}`, // This ensures that only one workflow is executed for this request
    customerEmail,
    emailBody,
    backOfficeEmail,
  });
}

main();
