<p align="center">
<img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# Apollo Server Adapter for Inferable

![NPM Version](https://img.shields.io/npm/v/%40inferable%2Fapollo-server-adapter?color=32CD32)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

The Inferable Apollo Server Adapter allows you to expose your existing GraphQL API as Inferable functions. This enables AI agents to interact with your GraphQL API while preserving all your existing middleware and type safety.

## Installation

### npm

```bash
npm install @inferable/apollo-server-adapter
```

### yarn

```bash
yarn add @inferable/apollo-server-adapter
```

### pnpm

```bash
pnpm add @inferable/apollo-server-adapter
```

## Quick Start

Add the Inferable adapter to your Apollo Server:

```ts
import { ApolloServer } from "@apollo/server";
import { inferableAdapter } from "@inferable/apollo-server-adapter";
import { Inferable } from "inferable";

const server = new ApolloServer<InferableGraphQLContext>({
  typeDefs,
  resolvers,
});

// Add the Inferable adapter
server.addPlugin(
  inferableAdapter({
    inferableClient: new Inferable({
      endpoint: process.env.INFERABLE_URL,
      apiSecret: process.env.INFERABLE_API_SECRET,
    }),
    apolloServer: server,
  })
);
```

Your GraphQL queries and mutations are now available as Inferable functions!

```ts
const result = await client.run({
  initialPrompt: "Get the user with id 1",
  resultSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
});
```

## Technical Details

The adapter automatically:

1. Introspects your GraphQL schema to generate JSON Schema definitions for all queries and mutations
2. Creates Inferable functions for each query and mutation
3. Handles argument passing and result formatting
4. Provides type safety through the InferableGraphQLContext

The adapter supports:

- All GraphQL scalar types
- Complex input types
- Nested queries and mutations
- Custom context passing
- [Human in the loop](https://docs.inferable.ai/pages/human-in-the-loop) workflows
- [Custom authentication](https://docs.inferable.ai/pages/custom-auth)

## Documentation

[Inferable documentation](https://docs.inferable.ai) contains all the information you need to get started with Inferable.

## Limitations

- `approvalRequest()` currently has problems with the runtime schema validation. This will be fixed with [#332](https://github.com/inferablehq/inferable/issues/332).

## Support

For support or questions, please create an issue in the repository.

## Contributing

Contributions to the Inferable Apollo Server Adapter are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
