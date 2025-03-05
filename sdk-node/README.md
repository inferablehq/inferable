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
  const text = await fetch(input.url).then((res) => res.text());

  const { menuItems, hours } = ctx.llm.structured({
    input: text,
    schema: z.object({
      menuItems: z.array(
        z.object({
          name: z.string(),
          price: z.number(),
        }),
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

## Documentation

- [Inferable documentation](https://docs.inferable.ai/) contains all the information you need to get started with Inferable.

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable NodeJs Client are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
