<p align="center">
  <img src="../assets/logo.png" alt="Inferable Logo" width="200" />
</p>

# Typescript SDK

[![npm version](https://badge.fury.io/js/inferable.svg)](https://badge.fury.io/js/inferable)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)
[![Downloads](https://img.shields.io/npm/dm/inferable)](https://www.npmjs.com/package/inferable)

This is the official Inferable AI SDK for Typescript.

## Installation

### npm

```bash
npm install inferable
```

### yarn

```bash
yarn add inferable
```

### pnpm

```bash
pnpm add inferable
```

## ⚡️ Quick Start

### Initialize Client

```typescript
import { Inferable } from "inferable";

const inferable = new Inferable({
  // Get yours at https://app.inferable.ai
  apiSecret: ""
  // Optional, if self-hosting (https://docs.inferable.ai/pages/self-hosting)
  // baseUrl: "http://localhost:4000",
});
```

### Register a Tool

Register a [tool](https://docs.inferable.ai/pages/tools) which is available for your agents to use.

> ℹ️ This example demonstrates Node.js. Tools can also be written in Go or .NET.

```typescript
inferable.tools.register({
  name: "greet",
  func: async (input) => {
    return `Hello, ${input.name}! My name is ${os.hostname()}.`;
  },
  schema: {
    input: z.object({
      name: z.string(),
    }),
  },
});

inferable.tools.listen();
```

### Create a Workflow

Workflows are a way to orchestrate agents. They are durable, distributed, and run on the machine that they are registered on.


> ℹ️ Workflow definitions can currently only be written in Node.js.

```typescript
const workflow = inferable.workflows.create({
  name: "greeting",
  inputSchema: z.object({
    executionId: z.string(),
    userName: z.string(),
  }),
});

workflow.version(1).define(async (ctx, input) => {
  const greetingAgent = ctx.agent({
    name: "greeter",
    tools: ["greet"],
    systemPrompt: helpers.structuredPrompt({
      facts: ["You are a friendly greeter"],
      goals: ["Return a greeting to the user"]
    }),
    resultSchema: z.object({
      greeting: z.string(),
    }),
  });

  const result = await greetingAgent.trigger({
    data: {
      name: input.userName,
    }
  });

  console.log(result.result.greeting);
  // ... or chain this to anther ctx.agent()
});

workflow.listen();
```

### Trigger the Workflow

Tgger the workflow from your application code or via a HTTP request.

```typescript
await inferable.workflows.trigger('greeting', {
  executionId: `123`,
  userName: "Alice",
});
```

```bash
curl -XPOST https://api.inferable.ai/clusters/$CLUSTER_ID/workflows/greeting/executions \
  -d '{"executionId": "123", "userName": "Alice"}' \
  -H "Authorization: Bearer $API_SECRET"
```

## Documentation

- [Inferable documentation](https://docs.inferable.ai/) contains all the information you need to get started with Inferable.

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable NodeJs Client are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
