#!/usr/bin/env tsx

import { exec } from "child_process";
import { buildMessageBody } from "../src/modules/email/test.util";

const messageBody = JSON.stringify(buildMessageBody({
  body: "Thanks for that, what time is it?",
  from: "john@johnjcsmith.com",
  subject: "Which tools?",
  to: [ "01JE9SYD010WFFJ6GVE26WGVVK@run.inferable.ai" ],
  messageId: "<abc123-9054-4BB5-ADA9-C9CB425D3844@johnjcsmith.com>",
  inReplyTo: "<0100019424f3b264-41907ca3-9529-47d8-8cad-2fd946031d29-000000@email.amazonses.com>"
}));

// Define the AWS CLI command
const region = "us-west-2";
const endpoint = "http://localhost:9324";
const queueUrl = "http://localhost:9324/000000000000/email-ingestion";
const command = `aws --region=${region} --endpoint=${endpoint} sqs send-message --queue-url ${queueUrl} --message-body '${messageBody}'`;

// Execute the AWS CLI command
exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error executing command: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
});
