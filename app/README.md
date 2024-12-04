<p align="center">
  <img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# Inferable Next.js UI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)

The Inferable Web UI is a user interface for Inferable's control plane. It is open-source and self-hostable.

<img src="https://github.com/inferablehq/inferable/blob/main/app/assets/screenshot.png" alt="Inferable UI" width="100%" style="border-radius: 10px" />

### Local Development

1. Start the control plane:

To run the UI locally for development, you will need the control plane running. Please see the [Readme](https://github.com/inferablehq/inferable/blob/main/control-plane/README.md) for instructions on how to run the control plane locally.

2. Populate environment variables:

Development environment varaiables are managed in the `.env`.

`.env.base` contains a base set of required environment variables. Copy `.env.base` to `.env`.

```base
cp .env.base .env
```

You will need to populate the following environment variables in `.env`:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Inferable relies on [Clerk](https://clerk.com/) for authentication. You can find your publishable key in the Clerk dashboard.

3. Start the Next.js development server:
```bash
npm run dev
```

## Documentation

- [Inferable documentation](https://docs.inferable.ai/) contains all the information you need to get started with Inferable.

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable UI are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
