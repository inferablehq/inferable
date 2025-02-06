<div align="center">

<img src="./assets/logo.png" alt="Inferable Logo" width="200" />

# Inferable

Reliable AI Agents with Durable Execution for Distributed Systems.

![NPM Version](https://img.shields.io/npm/v/inferable?color=32CD32&style=for-the-badge) ![GitHub go.mod Go version](https://img.shields.io/github/go-mod/go-version/inferablehq/inferable?filename=sdk-go%2Fgo.mod&color=32CD32&style=for-the-badge) ![NuGet Version](https://img.shields.io/nuget/v/inferable?color=32CD32&style=for-the-badge)
![License](https://img.shields.io/github/license/inferablehq/inferable?color=32CD32&style=for-the-badge)

</div>

## What is Inferable?

Inferable is a platform for building production-ready AI Agents. At a high level, it allows you to:

- Register **Tools** from your existing distributed systems.
- Define **Agents** that can use these tools to perform multi-step reasoning.
- Create **Durable Workflows** to combine agent reasoning with deterministic code execution.

<p align="center">
<img src="./assets/deployment.png" alt="Inferable Deployment" width="800" />
</p>

## Features

### Tools
- Wrap your existing code as tools, and let agents trigger them.
- Tools run on your own infrastructure, Inferable takes care of the orchestration.
- Built-in retry, caching, and failover support for tools.

### Agents
- Multi-step agents who can iteratively design their own execution plan.
- Context-aware tool selection based on Tool Discovery.
- Composable agents with structured outputs.

### Workflows
- Define "workflow as code" to orchestrate agents and tools.
- Mix agent reasoning with deterministic code execution to build complex workflows.
- All workflows are durable, and run on your own infrastructure.

<img src="./assets/deployment.png" alt="Inferable Deployment" width="800" />

## ⚡️ Quick Start

The easiest way to get started is by following the [Quickstart](https://docs.inferable.ai/pages/quick-start).

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
