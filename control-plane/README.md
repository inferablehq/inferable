<p align="center">
  <img src="../assets/logo.png" alt="Inferable Logo" width="200" />
</p>


# Control Plane

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)

## Get Started

### Inferable Cloud

Managed deployment of Inferable built for high availability and security. Inferable Cloud includes a [generous free teir](https://inferable.ai/pricing) and requires no credit card to get started.

[Inferable Cloud](https://app.inferable.ai).

### Open-source / hobby instance

Inferable's control-plane is open-source and self-hostable.

[Self hosting guide](https://docs.inferable.ai/pages/self-hosting)

### Local Development

To run the control plane locally for development:

1. Start the local resources required for development:
```bash
docker compose -f docker-compose.dev.yml up
```

This will start:
- PostgreSQL database with pgvector
- Redis for caching

2. Populate environment variables:

Development environment varaiables are managed in the `.env`.

`.env.base` contains a base set of required environment variables. Copy `.env.base` to `.env`.

```base
cp .env.base .env
```

You will need to populate the following environment variables in `.env`:

- Model provider API keys (`ANTHROPIC_API_KEY` and `COHERE_API_KEY`) OR `BEDROCK_AVAILABLE`
  - If you specify `BEDROCK_AVAILABLE` ensure your environment has access to AWS Bedrock. (See [routing.ts](https://github.com/inferablehq/inferable/blob/main/control-plane/src/modules/models/routing.ts) for model requirements)
- `JWKS_URL` OR `MANAGEMENT_API_SECRET` (For headless mode)

4. Run DB migrations:

Inferable uses [drizzle](https://github.com/drizzle-team/drizzle-orm) to manage database migrations. To run migrations:

```bash
npm run migrate
```

3. Start the control plane:
```bash
npm run dev
```

The API will be available at `http://localhost:4000`.

4. Connect via the CLI (Optional):

```bash
npm install -g @inferable/cli
export INFERABLE_API_ENDPOINT=http://localhost:4000

# If running in headless mode, you will be prompted for the management API secret
inf auth login

# Create a new cluster
inf clusters create
```

## Documentation

- [Inferable documentation](https://docs.inferable.ai/) contains all the information you need to get started with Inferable.

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable Control Plane are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.
