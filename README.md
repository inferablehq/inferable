<div align="center">

<img src="./assets/logo.png" alt="Inferable Logo" width="200" />

# Inferable

Build production-ready AI Agents with Durable Execution.

![NPM Version](https://img.shields.io/npm/v/inferable?color=32CD32&style=for-the-badge) ![GitHub go.mod Go version](https://img.shields.io/github/go-mod/go-version/inferablehq/inferable?filename=sdk-go%2Fgo.mod&color=32CD32&style=for-the-badge) ![NuGet Version](https://img.shields.io/nuget/v/inferable?color=32CD32&style=for-the-badge)
![License](https://img.shields.io/github/license/inferablehq/inferable?color=32CD32&style=for-the-badge)

</div>

## What is Inferable?

Inferable is a platform for building production-ready AI Agents. At a high level, it allows you to:

- Register **Tools** from your new or existing distributed systems.
- Define **Agents** that can use these tools to perform multi-step reasoning and take actions.
- Create **Durable Workflows** that compose agent intractions with "workflow as code".

<p align="center">
<img src="./assets/deployment.png" alt="Inferable Deployment" width="800" />
</p>

## 👉 High-level Features

### 🧰 Tools
- Wrap your existing code as [tools](https://docs.inferable.ai/pages/tools), and let agents trigger them with our SDKs.
- Tools run on your [own infrastructure](https://docs.inferable.ai/pages/enterprise#on-premise-tool-execution-and-data-localization), Inferable takes care of the orchestration.
- Built-in [retry, caching](https://docs.inferable.ai/pages/tool-configuration), and [failover](https://docs.inferable.ai/pages/tool-failures) support for tools.

### 🤖 Agents
- [Multi-step reasoning agents](https://docs.inferable.ai/pages/agents) who can iteratively design their own execution plan.
- Context-aware [tool selection](https://docs.inferable.ai/pages/agent-tools) and built-in Service Discovery for tools.
- [Composable agents](https://docs.inferable.ai/pages/multiple-agents) with structured outputs.

### 📜 Workflows
- Define "[workflow as code](https://docs.inferable.ai/pages/workflows)" to orchestrate agents and tools.
- Mix agent reasoning with deterministic code execution to build [complex workflows](https://docs.inferable.ai/pages/multiple-agents).
- All workflows are [durable](https://docs.inferable.ai/pages/workflow-durability), and run on your own infrastructure.

**...with minimal adoption curve**
- [No network ingress](https://docs.inferable.ai/pages/enterprise#private-networking) needed. Everything works via long-polling HTTP endpoints.
- [Trigger workflows](https://docs.inferable.ai/pages/your-first-workflow#triggering-workflows) from external events, or from other workflows. It's just HTTP.
- Fully [open-source](https://github.com/inferablehq/inferable) and self-hostable.

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

For more details, see our [Quickstart](https://docs.inferable.ai/pages/quick-start).

## 📚 Language Support

| Language | Source | Package |
| -------- | -------- | -------- |
| Node.js / TypeScript | [Quick start](./sdk-node/README.md) | [NPM](https://www.npmjs.com/package/inferable) |
| Go | [Quick start](./sdk-go/README.md) | [Go](https://pkg.go.dev/github.com/inferablehq/inferable/sdk-go) |
| .NET | [Quick start](./sdk-dotnet/README.md) | [NuGet](https://www.nuget.org/packages/Inferable) |
| React (Chat-only) | [Quick start](./sdk-react/README.md) | [NPM](https://www.npmjs.com/package/@inferable/react) |
| Bash | [Quick start](./sdk-bash/README.md) | [Source](https://github.com/inferablehq/inferable/blob/main/sdk-bash/inferable.sh) |

## 🚀 Open Source

This repository contains the Inferable control-plane, as well as SDKs for various languages.

**Core services:**

- `/control-plane` - The core Inferable control plane service
- `/app` - Playground front-end and management console
- `/cli` - Command-line interface tool (alpha)

**SDKs:**

- `/sdk-node` - Node.js/TypeScript SDK
- `/sdk-go` - Go SDK
- `/sdk-dotnet` - .NET SDK
- `/sdk-react` - React SDK

## 💾 Self Hosting

Inferable is 100% open-source and self-hostable. See our [self hosting guide](https://docs.inferable.ai/pages/self-hosting) for more details.

## 🤝 Contributing

We welcome contributions to all projects in the Inferable repository. Please read our [contributing guidelines](./CONTRIBUTING.md) before submitting any pull requests.

## 📝 License

All code in this repository is licensed under the MIT License.
