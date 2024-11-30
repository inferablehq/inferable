![Inferable Hero](./assets/hero.png)

<div align="center">

[![Website](https://img.shields.io/badge/website-inferable.ai-blue)](https://inferable.ai) [![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)

![NPM Version](https://img.shields.io/npm/v/inferable?color=32CD32) ![GitHub go.mod Go version](https://img.shields.io/github/go-mod/go-version/inferablehq/inferable?filename=sdk-go%2Fgo.mod&color=32CD32) ![NuGet Version](https://img.shields.io/nuget/v/inferable?color=32CD32)

</div>

# About Inferable

Inferable is an open source platform that helps you build reliable LLM-powered agentic automations at scale.

## Key Features

- Managed Agent Runtime - ReAct-like agent runtime powered by your own functions
- Durable Tool Calling - Recover from failures, load balance across compute, cache results
- Zero Network Config - No inbound connections or networking required
- Multiple Language Support - Native SDKs for TypeScript, Go, .NET and more
- Fully Open Source - MIT licensed and self-hostable

![Deployment](./assets/deployment.png)

## Powered by your code

Automations are powered by your greenfield or brownfield code. Agent capabilities are defined by your own functions.

**1. Define one or more functions that can be called by an automation**

```typescript
async function readWebPage({ url }: { url: string }) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  return await page.content();
}
```

**2. Register the function with Inferable**

```typescript
inferable.default.register({
  name: "readWebPage",
  func: readWebPage,
  input: z.object({
    url: z.string(),
  }),
});
```

**3. Create a run that uses the function**

```typescript
inferable.run({
  initialPrompt: `
    Produce me a list of all the open source projects
    at https://news.ycombinator.com/show, with their
    github url, programming language and fork count.
  `,
  resultSchema: z.array(
    z.object({
      url: z.string().regex(/^https:\/\/github\.com\/.*$/),
      language: z.string(),
      forkCount: z.number(),
    })
  ),
  // attachedFunctions: ["readWebPage"], // Optional, defaults to all registered functions
});
```

## Getting Started

Check out our [quick start guide](https://docs.inferable.ai/pages/quick-start) for a step-by-step guide on how to get started with creating your first automation.

## Self Hosting

Inferable is 100% open-source and self-hostable. See our [self hosting guide](https://docs.inferable.ai/pages/self-hosting) for more details.

## Language Support

- [Node.js / TypeScript](./sdk-node/README.md) ([Quick start](./sdk-node/README.md#quick-start))
- [Go](./sdk-go/README.md) ([Quick start](./sdk-go/README.md#quick-start))
- [.NET](./sdk-dotnet/README.md) ([Quick start](./sdk-dotnet/README.md#quick-start))
- [React](./sdk-react/README.md) ([Quick start](./sdk-react/README.md#quick-start))

## Documentation

For comprehensive documentation on using Inferable AI, please visit our [official documentation](https://docs.inferable.ai/).

## Open Source

This repository contains the Inferable control-plane, as well as SDKs for various languages.

**Core services:**

- `/control-plane` - The core Inferable control plane service
- `/app` - Web console/dashboard application
- `/cli` - Command-line interface tool

**SDKs:**

- `/sdk-node` - Node.js/TypeScript SDK
- `/sdk-go` - Go SDK
- `/sdk-dotnet` - .NET SDK
- `/sdk-react` - React SDK

**Bootstrap templates:**

- `/bootstrap-node` - Node.js bootstrap application template
- `/bootstrap-go` - Go bootstrap application template
- `/bootstrap-dotnet` - .NET bootstrap application template

## Contributing

We welcome contributions to all projects in the Inferable repository. Please read our [contributing guidelines](./CONTRIBUTING.md) before submitting any pull requests.

## License

All code in this repository is licensed under the MIT License.
