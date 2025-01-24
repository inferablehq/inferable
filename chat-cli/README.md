## Inferable Chat

A React-based chat interface for Inferable, available both as a CLI tool and a React component.

## CLI Usage

### Installation

```bash
npm install -g @inferable/chat
```

This will make the `inf-chat` command available globally.

### Basic Usage

```bash
inf-chat \
  --api-secret your_api_secret \
  --cluster-id your_cluster_id \
  [--agent-id your_agent_id] \
  [--run-id existing_run_id]
```

### Environment Variables
All flags can also be set via environment variables:
- `INFERABLE_API_SECRET`
- `INFERABLE_CLUSTER_ID` 
- `INFERABLE_AGENT_ID`

Flags take precedence over environment variables.

### Using with npx
```bash
npx @inferable/chat --api-secret your_api_secret --cluster-id your_cluster_id
```

## Library Usage

### Installation

```bash
npm install @inferable/chat
```

### Usage as a React Component

```tsx
import { ChatInterface } from '@inferable/chat';

function MyApp() {
  return (
    <ChatInterface
      apiSecret="your-api-secret"
      clusterId="your-cluster-id"
      runId="optional-run-id"
      agentId="optional-agent-id"
    />
  );
}
```

## Local Development

```bash
npm run dev
```
