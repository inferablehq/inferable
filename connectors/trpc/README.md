<p align="center">
<img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# tRPC Adapter for Inferable

![npm version](https://badge.fury.io/js/@inferable/trpc-connector.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

The Inferable tRPC Adapter allows you to expose your existing tRPC router endpoints as Inferable functions. This enables AI agents to interact with your tRPC API while preserving all your existing middleware and type safety.

## Installation

### npm

```bash
npm install @inferable/trpc-connector
```

### yarn

```bash
yarn add @inferable/trpc-connector
```

### pnpm

```bash
pnpm add @inferable/trpc-connector
```

## Quick Start

Create your tRPC router as normal:

```ts
const t = initTRPC.create();

const router = t.router;
const publicProcedure = t.procedure;

const appRouter = t.router({
  userById: publicProcedure
    .input(z.object({ id: z.string() }))
    .meta({ inferable: true }) // <--- Mark this procedure for Inferable
    .query(({ input }) => {
      return users.find((user) => user.id === input.id);
    }),
});
```

Create an Inferable service from your router:

```ts
import { createInferableService } from "@inferable/trpc-connector";
import { Inferable } from "inferable";

const client = new Inferable({
  apiSecret: process.env.INFERABLE_API_SECRET,
});

const service = createInferableService({
  router: appRouter,
  createCaller: t.createCallerFactory(appRouter),
  name: "userService",
  client,
});

// Start the service
await service.start();
```

3. Your tRPC procedures are now available as Inferable functions!

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

## Notes

- Preserve Middleware: All your existing tRPC middleware continues to work
- Type Safety: Maintains full type safety through your tRPC router
- Selective Exposure: Only procedures marked with meta({ inferable: true }) are exposed
- Custom Descriptions: Add descriptions to help guide the AI through meta({ description: "..." })

## Documentation

Inferable documentation contains all the information you need to get started with Inferable.

## Support

For support or questions, please create an issue in the repository.

## Contributing

Contributions to the Inferable tRPC Connector are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
