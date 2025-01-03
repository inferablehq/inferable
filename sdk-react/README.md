<p align="center">
  <img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# React SDK

[![npm version](https://badge.fury.io/js/%40inferable%2Freact.svg)](https://badge.fury.io/js/%40inferable%2Freact)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)

This is the official Inferable AI SDK for React.
It is used to start and interact with [Inferable runs](https://docs.inferable.ai/pages/runs) from React applications.

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

Here's a minimal example showing how to use the three main hooks:

```tsx
import { useInferable, useRun, useMessages } from "@inferable/react";

function Chat() {
  // Initialize the Inferable client
  const inferable = useInferable({
    clusterId: "your-cluster-id",
    // Simple cluster-based auth for backend services
    authType: "cluster",
    apiSecret: "your-api-secret",
    // Or use custom auth for frontend apps with user-specific permissions
    // https://docs.inferable.ai/pages/custom-auth
    // authType: "custom",
    // customAuthToken: "your-custom-auth-token",
  });

  // Start or connect to a run
  const run = useRun(inferable);

  // Get utility functions for working with messages
  const messages = useMessages(run.messages);

  return (
    <div>
      {/* Display messages */}
      {messages.all("asc")?.map(msg => (
        <div key={msg.id}>
          {msg.type === "human" ? "You: " : "Assistant: "}
          {msg.data.message}
        </div>
      ))}

      {/* Message input */}
      <input
        onKeyPress={e => {
          if (e.key === "Enter") {
            run.createMessage(e.target.value);
            e.target.value = "";
          }
        }}
        placeholder={run?.id ? "Type your message..." : "Type your initial message..."}
      />
    </div>
  );
}
```

## Running the Demo

The repository includes a development server in the `./demo` directory:

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

This will start a Vite dev server at http://localhost:3000 with a test page that provides a simple interface to test the SDK's functionality.

## API Reference

### useInferable Hook

The core hook for initializing the Inferable client.

```typescript
const inferable = useInferable({
  clusterId: string;
  authType: "custom" | "cluster";
  customAuthToken?: string;  // Required if authType is "custom"
  apiSecret?: string;        // Required if authType is "cluster"
  baseUrl?: string;         // Optional, defaults to "https://api.inferable.ai"
});

// Returns:
{
  client: ApiClient;
  clusterId: string;
  createRun: (options: {
    initialPrompt: string;
    systemPrompt?: string;
    name?: string;
    model?: "claude-3-5-sonnet" | "claude-3-haiku";
    resultSchema?: z.ZodObject<any>;
    metadata?: Record<string, string>;
    interactive?: boolean;
  }) => Promise<{ id: string }>;
  listRuns: () => Promise<{
    runs: Array<{
      id: string;
      name: string;
      userId: string | null;
      createdAt: Date;
      status: "pending" | "running" | "paused" | "done" | "failed" | null;
      test: boolean;
      configId: string | null;
      configVersion: number | null;
      feedbackScore: number | null;
    }>;
  }>;
}
```

### useRun Hook

Manages an individual run session with real-time updates.

```typescript
const {
  setRunId,        // Function to set the current run ID
  createMessage,   // Function to send a new message
  messages,        // Array of all messages in the run
  run,            // Current run details
  result,         // Typed result if resultSchema was provided
  error           // Error object if any errors occurred
} = useRun(inferable, {
  persist?: boolean;  // Whether to persist run ID in localStorage (default: true)
});
```

### useMessages Hook

Provides utility functions for working with messages.

```typescript
const {
  all, // Function to get all messages sorted
  getOfType, // Function to filter messages by type
} = useMessages(messages);

// Example usage:
const allMessages = all("asc"); // Get all messages, oldest first
const humanMessages = getOfType("human"); // Get only human messages
const agentMessages = getOfType("agent"); // Get only agent messages
const results = getOfType("invocation-result"); // Get only invocation results
```

## Documentation

For more detailed information, visit the [Inferable documentation](https://docs.inferable.ai/).

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable React SDK are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
