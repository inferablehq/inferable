#!/usr/bin/env tsx

import { exec } from "child_process";
import { buildMessageBody } from "../src/modules/email/test.util";

const messageBody = JSON.stringify(buildMessageBody({
  body: "What tools are available",
  from: "john@johnjcsmith.com",
  subject: "This is a test",
  to: [ "01JE9SYD010WFFJ6GVE26WGVVK@run.inferable.ai" ],
  messageId: "<93FC27CD-9054-4BB5-ADA9-C9CB425D3844@johnjcsmith.com>"
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
