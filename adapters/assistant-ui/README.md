<p align="center">
  <img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# Assistant UI Runtime

[![npm version](https://badge.fury.io/js/%40inferable%2Freact.svg)](https://badge.fury.io/js/%40inferable%2Freact)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)

Inferable Runtime for [assistant-ui](https://github.com/Yonom/assistant-ui).

## Installation

```bash
npm install @inferable/assistant-ui
```

```bash
yarn add @inferable/assistant-ui
```

```bash
pnpm add @inferable/assistant-ui
```

## Quick Start

> More details on Inferable front-end usage can be found [here](https://docs.inferable.ai/pages/frontend).

### useInferableRuntime

`useInferableRuntime` provides an `AssistantRuntime` object which can be used with `assistant-ui` to render a Chat UI with Inferable.

```typescript
import { useInferableRuntime } from '@inferable/assistant-ui';
import { AssistantRuntimeProvider, Thread } from "@assistant-ui/react";

const { runtime, run } = useInferableRuntime({
  clusterId: '<YOUR_CLUSTER_ID>',
  customAuthToken: 'your-custom-auth-token',
  // apiSecret: 'your-api-secret', // Not recommended
  onError: (error) => {
    console.error(error);
  }
})

return (
  <div className="h-full">
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread/>
    </AssistantRuntimeProvider>
  </div>
);
```

`userInferableRuntime` can also be used with `AssistantModal` for a modal UI.


#### Error Handling

You can handle errors by providing an `onError` callback:

```typescript
  const { runtime, run } = useInferableRuntime({
    clusterId: '<YOUR_CLUSTER_ID>',
    customAuthToken: 'your-custom-auth-token',
    // apiSecret: 'your-api-secret', // Not recommended
    onError: (error) => {
      console.error(error);
    }
  })
```

### Rendering function UI

You can provide assistant-ui with [custom UI components](https://www.assistant-ui.com/docs/guides/ToolUI) for rendering Inferable function calls / results.

#### Example

```typescript
// Fallback UI
const FallbackToolUI = ({args, result, toolName}) =>
  <div className="center">
    <h1>Tool: {toolName}</h1>
    <h2>Input:</h2>
    <pre className="whitespace-pre-wrap">{JSON.stringify(args, null, 2)}</pre>
    <h2>Output:</h2>
    {result && <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>}
    {!result && <p>No output</p>}
  </div>

// Custom UI example
const SearchToolUI = makeAssistantToolUI<any, any>({
  toolName: "default_webSearch",
  render: ({ args }) => {
    return <p>webSearch({args.query})</p>;
  },
});

return (
  <div className="h-full">
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread
        tools={[
          WebSearchToolUI
        ]},
        assistantMessage={{
          components: {
            ToolFallback: FallbackToolUI
          },
      }} />
    </AssistantRuntimeProvider>
  </div>
);
```


## Local Development

There is development server included in the repository at `./demo`.

1. Start the development server:
```bash
npm run dev
```

This will start a Vite dev server at http://localhost:3000 with the test page, which provides a simple interface to test the runtime.

## Documentation

- [Inferable documentation](https://docs.inferable.ai/) contains all the information you need to get started with Inferable.
- [Assistant UI documentation](https://www.assistant-ui.com/docs/getting-started) contains all the information you need to get started with Assistant UI.

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable React SDK are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
