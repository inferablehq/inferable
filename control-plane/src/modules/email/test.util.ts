import { ulid } from "ulid";

export function buildMessageBody({from, to, subject, body, messageId}: {
  from: string;
  to: string[];
  subject: string;
  body: string;
  messageId: string;
}) {

  const messageBase = {
    notificationType: "Received",
    mail: {
      timestamp: "",
      source: from,
      messageId: ulid(),
      destination: to,
      headersTruncated: false,
      headers: [],
      commonHeaders: {
        returnPath: from,
        from: [ from ],
        date: "",
        to,
        messageId: messageId,
        subject,
      }
    },
    receipt: {
      timestamp: "",
      processingTimeMillis: 764,
      recipients: to,
      spamVerdict: { status: 'PASS' },
      virusVerdict: { status: 'PASS' },
      spfVerdict: { status: 'PASS' },
      dkimVerdict: { status: 'FAIL' },
      dmarcVerdict: { status: 'GRAY' },
      action: {
        type: "",
        topicArn: "",
        encoding: 'UTF8'
      }
    },
    content: `Return-Path: <${from}>\r\n` +
      `From: ${from}\r\n` +
      'Content-Type: text/plain\r\n' +
      'Content-Transfer-Encoding: 7bit\r\n' +
      'Mime-Version: 1.0 (Mac OS X Mail 16.0 \\(3826.300.87.4.3\\))\r\n' +
      `Subject: ${subject}\r\n` +
      `Message-Id: ${messageId}\r\n` +
      'Date: Tue, 31 Dec 2024 14:45:38 +1030\r\n' +
      `To: ${to}\r\n` +
      '\r\n' +
      body +
      '\r\n'
  }

  return {
    Type: "Notification",
    MessageId: ulid(),
    TopicArn: "",
    Subject: "",
    Timestamp: "",
    SignatureVersion: "",
    Signature: "",
    SigningCertURL: "",
    UnsubscribeURL: "",
    Message: JSON.stringify(messageBase)
  }
}
