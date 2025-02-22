import { inferable } from "./inferable";
import { workflow } from "./workflow";

async function main() {
  await workflow.listen();

  console.log("Workflows and tools listening");

  // listen for a zendesk ticket webhook
  const zendeskTicketId = "1234567890";
  const zendeskTicketText = "I need a refund for my green boots";

  inferable.workflows.trigger("ticketTagging", {
    executionId: zendeskTicketId, // This ensures that only one workflow is executed for this ticket. Subsequent calls with the same executionId will be ignored.
    ticketId: zendeskTicketId,
    ticketText: zendeskTicketText,
  });
}

main();
