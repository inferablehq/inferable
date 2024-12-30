import React, { useState } from "react";
import { useRun } from "../src";
import { z } from "zod";
import assert from "assert";

type TestPageProps = {
  baseUrl?: string;
  apiSecret?: string;
  customAuthToken: string;
  clusterId: string;
  configId: string;
  initialPrompt?: string;
};

export function TestPage(props: TestPageProps) {
  const [message, setMessage] = useState("");
  const { createMessage, messages, run } = useRun({
    ...props,
    authType: "custom",
    customAuthToken: props.customAuthToken,
    resultSchema: z.object({
      foo: z.literal("bar"),
    }),
  });

  const [started, setStarted] = useState(false);

  const handleSubmit = async () => {
    await createMessage({
      message,
      type: "human",
    });
    setMessage("");
  };

  if (!started) {
    return (
      <div
        style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}
      >
        <button
          onClick={() => {
            setStarted(true);
          }}
          style={{ padding: "8px 16px" }}
        >
          Start Run
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        gap: "20px",
        padding: "20px",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ width: "700px", overflowY: "auto" }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ margin: "8px 0" }}>
              <strong>{msg.type}:</strong>
              <pre>{JSON.stringify(msg, null, 2)}</pre>
            </div>
          ))}
        </div>
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          style={{ padding: "8px" }}
        />
        <button onClick={handleSubmit} style={{ padding: "8px 16px" }}>
          Send Message
        </button>
      </div>
      <div style={{ width: "300px", padding: "10px", borderLeft: "1px solid #eee" }}>
        <h3>Run Status</h3>
        <pre>{JSON.stringify(run, null, 2)}</pre>
      </div>
    </div>
  );
}
