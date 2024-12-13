<p align="center">
<img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# tRPC Adapter for Inferable

![NPM Version](https://img.shields.io/npm/v/%40inferable%2Ftrpc-adapter?color=32CD32)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

The Inferable tRPC Adapter allows you to expose your existing tRPC router endpoints as Inferable functions. This enables AI agents to interact with your tRPC API while preserving all your existing middleware and type safety.

## Installation

### npm

```bash
npm install @inferable/trpc-adapter
```

### yarn

```bash
yarn add @inferable/trpc-adapter
```

### pnpm

```bash
pnpm add @inferable/trpc-adapter
```

## Quick Start

Create your tRPC router with the Inferable plugin:

```ts
import { inferablePlugin } from "@inferable/trpc-adapter";

const t = initTRPC.create();
const withInferable = inferablePlugin();

const appRouter = t.router({
  userById: t.procedure
    .unstable_concat(withInferable) // It's safe to use unstable_concat - https://trpc.io/docs/faq#unstable
    .input(z.object({ id: z.string() }))
    .meta({ description: "Fetch a user by their ID" }) // This will be used to encrich the LLM context
    .query(({ input }) => {
      return users.find((user) => user.id === input.id);
    }),
});
```

Create an Inferable service from your router:

```ts
import { createInferableService } from "@inferable/trpc-adapter";
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

## Technical Details

The plugin does two things:

1. It adds a `meta` field to the procedures with `{ inferable: { enabled: true } }`. This is used to identify the procedures that should be exposed as Inferable functions.
2. It adds a `ctx` field to the tRPC procedure so you can validate the context that's passed by Inferable in your down stream procedures or middleware.

- This allows you model [human in the loop](https://docs.inferable.ai/pages/human-in-the-loop) workflows where you can fire off a approval request to a human before the function is run.
- It also allows you to handle [custom auth](https://docs.inferable.ai/pages/custom-auth) in your tRPC procedures.
- For more information on the context object, see the [context documentation](https://docs.inferable.ai/pages/context).

## Documentation

[Inferable documentation](https://docs.inferable.ai) contains all the information you need to get started with Inferable.

## Support

For support or questions, please create an issue in the repository.

## Contributing

Contributions to the Inferable tRPC Connector are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
