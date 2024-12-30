<p align="center">
  <img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# React SDK

[![npm version](https://badge.fury.io/js/%40inferable%2Freact.svg)](https://badge.fury.io/js/%40inferable%2Freact)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)

This is the official Inferable AI SDK for React.
It is used to start and interact with [Inferable runs](https://docs.inferable.ai/pages/runs) from React applications.

It does **not** currently support [registering functions](https://docs.inferable.ai/pages/functions) as the backend SDKs do.

## Installation

```bash
npm install @inferable/react
```

```bash
yarn add @inferable/react
```

```bash
pnpm add @inferable/react
```

## Quick Start

Here's a simple example of a chat interface that uses both `useRun` and `useRuns` hooks:

```tsx
import { useRun, useRuns } from "@inferable/react";
import { useState } from "react";

function Chat() {
  const [input, setInput] = useState("");

  // Get list of all runs
  const { runs } = useRuns({
    clusterId: "your-cluster-id",
    authType: "custom",
    customAuthToken: "your-custom-auth-token",
  });

  // Get current run and message handling
  const { messages, createMessage } = useRun({
    clusterId: "your-cluster-id",
    authType: "custom",
    customAuthToken: "your-custom-auth-token",
  });

  const handleSend = async () => {
    if (!input.trim()) return;

    await createMessage({
      message: input,
      type: "human",
    });
    setInput("");
  };

  return (
    <div>
      {/* Display previous runs */}
      <div className="runs-list">
        <h3>Previous Runs</h3>
        {runs.map(run => (
          <div key={run.id}>
            {run.name} - {run.status}
          </div>
        ))}
      </div>

      {/* Display current chat */}
      <div className="chat">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.type}`}>
            {msg.type === "human" ? "👤" : "🤖"} {msg.message}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="input-area">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === "Enter" && handleSend()}
          placeholder="Type your message..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}

export default Chat;
```

This example demonstrates:

- Listing all runs using `useRuns`
- Starting a new run and handling messages using `useRun`
- Sending messages to the run
- Basic UI for displaying messages and run history

> More details on Inferable front-end usage can be found [here](https://docs.inferable.ai/pages/frontend).

### useRun Hook

The `useRun` hook returns an object with the following properties:

```typescript
{
  client: ApiClient;        // The underlying API client
  createMessage: Function;  // Function to add new messages to the run
  messages: Message[];      // Array of all messages in the run
  run?: Run;               // Current run status and metadata
  result?: T;              // Typed result of the run if resultSchema was provided
  error: Error | null;     // Error if any occurred during operations
}
```

#### Basic Usage

```typescript
const { messages, run, createMessage } = useRun({
  clusterId: "your-cluster-id",
  authType: "custom",
  customAuthToken: "your-custom-auth-token",
  // apiSecret: 'your-api-secret', // Alternative auth method
  // pollInterval: 1000, // Optional: defaults to 1000ms
  // resultSchema: z.object({...}), // Optional: schema for typed run results
});
```

#### Adding Messages

You can add messages to the run by calling the `createMessage` function:

```typescript
await createMessage({
  message: "Hello!",
  type: "human",
});
```

#### Error Handling

You can handle errors by providing an `onError` callback:

```typescript
const { messages, run, createMessage } = useRun({
  clusterId: "your-cluster-id",
  authType: "custom",
  customAuthToken: "your-custom-auth-token",
  onError: error => {
    console.error("Run error:", error);
  },
});
```

#### Polling Interval

The hook polls for updates by default every 1000ms. You can customize this:

```typescript
const { messages } = useRun({
  // ... other options
  pollInterval: 2000, // Poll every 2 seconds
});
```

### useRuns Hook

The `useRuns` hook returns an object with the following properties:

```typescript
{
  runs: Array<{
    id: string; // The run ID
    name: string; // Name of the run
    userId: string | null; // User ID associated with the run
    createdAt: Date; // When the run was created
    status: "pending" | "running" | "paused" | "done" | "failed" | null; // Current status
    test: boolean; // Whether this is a test run
    configId: string | null; // Associated config ID
    configVersion: number | null; // Version of the config
    feedbackScore: number | null; // Feedback score if any
  }>;
}
```

#### Basic Usage

```typescript
const { runs } = useRuns({
  clusterId: "your-cluster-id",
  authType: "custom",
  customAuthToken: "your-custom-auth-token",
  // apiSecret: 'your-api-secret', // Alternative auth method
  // pollInterval: 2000, // Optional: defaults to 2000ms
});
```

#### Polling Interval

The hook polls for updates by default every 2000ms. You can customize this:

```typescript
const { runs } = useRuns({
  // ... other options
  pollInterval: 5000, // Poll every 5 seconds
});
```

## Custom Authentication

Custom Authentication is a feature that allows you to bring your own custom auth tokens and validate them via your own auth providers. It ensure you can safely call the inferable API:

1. Without exposing your API secret
2. Without any privilege escalation on user data

For more infromation, see [Custom Auth](https://docs.inferable.ai/pages/custom-auth).

## Local Development

There is development server included in the repository at `./demo`.

1. Start the development server:

```bash
npm run dev
```

This will start a Vite dev server at http://localhost:3000 with the test page, which provides a simple interface to test the SDK's functionality.

## Documentation

- [Inferable documentation](https://docs.inferable.ai/) contains all the information you need to get started with Inferable.

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable React SDK are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
