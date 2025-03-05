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

This guide will help you quickly set up and run your first Inferable workflow with structured outputs.

### 1. Create a demo cluster

A cluster is a logical grouping of tools, agents and workflows that work together.

```bash
mkdir inferable-demo
cd inferable-demo
curl -XPOST https://api.inferable.ai/ephemeral-setup > cluster.json
```

### 2. Install dependencies

```bash
npm init -y
npm install inferable tsx
```

### 3. Create a workflow with structured outputs

Workflows are a way to define a sequence of actions to be executed. They run on your own compute and can be triggered from anywhere via the API.

```typescript
// simple-workflow.ts
import { Inferable } from "inferable";
import { z } from "zod";

const inferable = new Inferable({
  apiSecret: require("./cluster.json").apiKey,
});

const workflow = inferable.workflows.create({
  name: "simple",
  inputSchema: z.object({
    executionId: z.string(),
    url: z.string(),
  }),
});

workflow.version(1).define(async (ctx, input) => {
  const text = await fetch(input.url).then(res => res.text());

  const { menuItems, hours } = ctx.llm.structured({
    input: text,
    schema: z.object({
      menuItems: z.array(
        z.object({
          name: z.string(),
          price: z.number(),
        })
      ),
      hours: z.object({
        saturday: z.string(),
        sunday: z.string(),
      }),
    }),
  });

  return { menuItems, hours };
});

// This will register the workflow with the Inferable control-plane at api.inferable.ai
workflow.listen().then(() => {
  console.log("Workflow listening");
});
```

### 4. Run the workflow

Workflows can be triggered from anywhere.

```bash
# Get your cluster details
CLUSTER_ID=$(cat cluster.json | jq -r .id)
API_SECRET=$(cat cluster.json | jq -r .apiKey)

# Run the workflow
curl -XPOST https://api.inferable.ai/clusters/$CLUSTER_ID/workflows/simple/executions \
  -d '{"executionId": "123", "url": "https://a.inferable.ai/menu.txt"}' \
  -H "Authorization: Bearer $API_SECRET"
```

You can also trigger the workflow from your application code:

```typescript
// From your application code
await inferable.workflows.trigger("simple", {
  executionId: "123",
  url: "https://a.inferable.ai/menu.txt",
});
```

For more details, see our [Quickstart](https://docs.inferable.ai/pages/quick-start).

## 📚 Language Support

| Language             | Source                                | Package                                                                            |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| Node.js / TypeScript | [Quick start](./sdk-node/README.md)   | [NPM](https://www.npmjs.com/package/inferable)                                     |
| Go                   | [Quick start](./sdk-go/README.md)     | [Go](https://pkg.go.dev/github.com/inferablehq/inferable/sdk-go)                   |
| .NET                 | [Quick start](./sdk-dotnet/README.md) | [NuGet](https://www.nuget.org/packages/Inferable)                                  |
| React (Chat-only)    | [Quick start](./sdk-react/README.md)  | [NPM](https://www.npmjs.com/package/@inferable/react)                              |
| Bash                 | [Quick start](./sdk-bash/README.md)   | [Source](https://github.com/inferablehq/inferable/blob/main/sdk-bash/inferable.sh) |

## 🚀 Open Source

This repository contains the Inferable control-plane, as well as SDKs for various languages.

**Core services:**

- `/control-plane` - The core Inferable control plane service
- `/app` - Playground front-end and management console
- `/cli` - Command-line interface tool (alpha)

**SDKs:**

- `/sdk-node` - Node.js/TypeScript SDK

## 💾 Self Hosting

Inferable is 100% open-source and self-hostable. See our [self hosting guide](https://docs.inferable.ai/pages/self-hosting) for more details.

## 🤝 Contributing

We welcome contributions to all projects in the Inferable repository. Please read our [contributing guidelines](./CONTRIBUTING.md) before submitting any pull requests.

## 📝 License

All code in this repository is licensed under the MIT License.
