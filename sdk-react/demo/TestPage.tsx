import React, { useState, useEffect } from "react";
import { useInferable, useRun, useMessages } from "../src";
import { z } from "zod";
import { AuthOptions, UseInferableOptions } from "../src/hooks/useInferable";
import "./TestPage.css";

type MessageData = {
  message?: string;
  result?: Record<string, unknown>;
  done?: boolean;
  learnings?: Array<unknown>;
  issue?: string;
  invocations?: Array<unknown>;
};

const getMessageContent = (msg: { type: string; data: MessageData }) => {
  switch (msg.type) {
    case "human":
      return msg.data?.message || "";
    case "agent":
      return msg.data?.message || "";
    case "invocation-result":
      return JSON.stringify(msg.data?.result, null, 2);
    default:
      return "";
  }
};

export function TestPage(props: UseInferableOptions) {
  const [message, setMessage] = useState("");
  const [persist, setPersist] = useState(true);
  const [runs, setRuns] = useState<
    Array<{
      id: string;
      name: string;
      userId: string | null;
      createdAt: Date;
      status: "pending" | "running" | "paused" | "done" | "failed" | null;
      test: boolean;
      configId: string | null;
      configVersion: number | null;
      feedbackScore: number | null;
    }>
  >([]);

  const inferable = useInferable(props);

  const {
    createMessage,
    messages: rawMessages,
    run,
    result,
    setRunId,
  } = useRun(inferable, { persist });

  const messages = useMessages(rawMessages);

  const fetchRuns = async () => {
    try {
      const response = await inferable.listRuns();
      if (response.runs) {
        setRuns(response.runs);
      }
    } catch (error) {
      console.error("Failed to fetch runs:", error);
    }
  };

  useEffect(() => {
    if (inferable.clusterId) {
      fetchRuns();
      const interval = setInterval(fetchRuns, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [inferable.clusterId]);

  const handleSubmit = async () => {
    if (!message.trim()) return;

    if (!run?.id) {
      const { id } = await inferable.createRun({
        initialPrompt: message,
        interactive: true,
      });
      setRunId(id);
    } else {
      await createMessage(message);
    }
    setMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const sortedMessages = messages.all("asc");

  return (
    <div className="chat-container">
      <div className="chat-main">
        <div className="messages-container">
          {sortedMessages?.map(msg => (
            <div key={msg.id} className={`message ${msg.type}`}>
              <div className="message-header">{msg.type === "human" ? "You" : "Assistant"}</div>
              <div className="message-content">{getMessageContent(msg)}</div>
            </div>
          ))}
        </div>
        <div className="input-container">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={run?.id ? "Type your message..." : "Type your initial message..."}
            className="message-input"
          />
          <button onClick={handleSubmit} className="send-button">
            {run?.id ? "run.sendMessage" : "inferable.createRun"}
          </button>
        </div>
        <div
          className="options-section"
          style={{
            fontSize: "0.85em",
            opacity: 0.8,
            marginTop: "8px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <input
            type="checkbox"
            id="persist-checkbox"
            checked={persist}
            onChange={() => setPersist(!persist)}
            style={{ margin: 0 }}
          />
          <label htmlFor="persist-checkbox" style={{ cursor: "pointer" }}>
            Save chat in localStorage{" "}
            <span style={{ opacity: 0.6 }}>run.persist={persist.toString()}</span>{" "}
            {persist && "(refresh will restore chat)"}
          </label>
        </div>
      </div>
      <div className="status-panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ margin: 0 }}>Recent Runs</h3>
          <button
            onClick={fetchRuns}
            className="refresh-button"
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "0.8em",
              backgroundColor: "#f0f0f0",
              border: "1px solid #ddd",
              borderRadius: "4px",
            }}
          >
            Refetch Runs
          </button>
        </div>
        <div
          className="auth-type"
          style={{
            backgroundColor: "#f5f5f5",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "0.9em",
            color: "#666",
            marginBottom: "12px",
          }}
        >
          Using <strong>{props.authType}</strong> auth. All runs created using this token will be
          visible here.
        </div>
        <div className="runs-list">
          {runs.map(run => (
            <div key={run.id} className="run-item" onClick={() => setRunId(run.id)}>
              <div className="run-header">
                <span className="run-name">{run.name || "Unnamed Run"}</span>
                <span className={`run-status status-${run.status}`}>{run.status}</span>
              </div>
              <div className="run-time">{new Date(run.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
