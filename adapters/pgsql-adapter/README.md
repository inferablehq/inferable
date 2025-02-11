<p align="center">
<img src="https://a.inferable.ai/logo-hex.png" width="200" style="border-radius: 10px" />
</p>

# PostgreSQL Adapter for Inferable

![NPM Version](https://img.shields.io/npm/v/%40inferable%2Fpgsql-adapter?color=32CD32)
[![Documentation](https://img.shields.io/badge/docs-inferable.ai-brightgreen)](https://docs.inferable.ai/)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

This package provides a PostgreSQL adapter for Inferable allowing you to chat with your PostgreSQL database in natural language.

## Quickstart

```bash
# connection string doesn't leave your local machine
npx @inferable/pgsql-adapter postgresql://user:pass@localhost:5432/postgres --secret=sk_inf_xxx
```

## Usage

The package can be used either as a library in your Node.js application or as a standalone CLI tool.

### CLI Usage

You can run the adapter directly from the command line:

```bash
npx @inferable/pgsql-adapter <connection_string> [options]

Options:
      --version        Show version number                             [boolean]
      --approval-mode  Approval mode: "always" (all queries), "mutate" (only
                      data-modifying queries), or "off"
               [string] [choices: "always", "mutate", "off"] [default: "always"]
      --privacy-mode   Enable privacy mode. All data will be returned as blobs
                      (not sent to the model)         [boolean] [default: false]
      --schema        Database schema to use        [string] [default: "public"]
      --secret        Inferable API cluster secret                      [string]
      --endpoint      Inferable API endpoint                            [string]
      --test          Test the Database connection and exit             [boolean]
  -h, --help          Show help                                        [boolean]

Commands:
```

**Examples**

- Test database connection:

```bash
npx @inferable/pgsql-adapter postgresql://user:pass@localhost:5432/postgres test
```

- Prompt human approval on all workflows:

```bash
npx @inferable/pgsql-adapter postgresql://user:pass@localhost:5432/postgres \
   --approval-mode=always \
   --secret=sk_inf_xxx
```

- Prompt human approval on all data-modifying workflows:

```bash
npx @inferable/pgsql-adapter postgresql://user:pass@localhost:5432/postgres \
   --approval-mode=mutate \
   --secret=sk_inf_xxx
```

- Don't share query results with the LLM:

```bash
npx @inferable/pgsql-adapter postgresql://user:pass@localhost:5432/postgres \
   --privacy-mode \
   --secret=sk_inf_xxx
```

### Docker Usage

```bash
docker run -e CONNECTION_STRING=postgresql://user:pass@localhost:5432/postgres \
           -e SECRET=sk_inf_xxx \
           inferable/pgsql-adapter
```

#### Health Checks

For container orchestration platforms like ECS, Kubernetes, or Docker Swarm, the adapter provides a built-in health-check command which will validate the database connection healthjk:

```bash
# Example ECS task definition health check
"healthCheck": {
  "command": [
    "CMD-SHELL",
    "health-check || exit 1"
  ],
}
```

#### Configuration Options

You can configure the adapter using the following environment variables:

| Environment Variable | Description | Default | Required |
|---------------------|-------------|---------|----------|
| `CONNECTION_STRING` | PostgreSQL connection string | None | Yes |
| `SECRET` | Inferable API cluster secret | None | Yes |
| `APPROVAL_MODE` | Query approval mode: "always", "mutate", or "off" | "always" | No |
| `PRIVACY_MODE` | Enable privacy mode (true/false) | "false" | No |
| `SCHEMA` | Database schema to use | "public" | No |
| `ENDPOINT` | Optional custom Inferable API endpoint | None | No |

### Library Usage

```typescript
import { InferablePGSQLAdapter } from '@inferable/pgsql-adapter';
import { Inferable } from 'inferable';

const client = new Inferable({
  apiSecret: 'your-api-secret',
  endpoint: 'optional-custom-endpoint'
});

const adapter = new InferablePGSQLAdapter({
  connectionString: 'postgresql://user:pass@localhost:5432/db',
  schema: 'public',
  approvalMode: 'always',
  privacyMode: false
});

await adapter.initialize();
adapter.register(client);

await client.tools.listen();

// Handle cleanup
process.on('SIGTERM', async () => {
  await client.tools.unlisten();
});
```

## Configuration Options

- `connectionString`: PostgreSQL connection string (required)
- `schema`: Database schema to use (default: "public")
- `privacyMode`: Don't send query results through the LLM (default: false)
- `approvalMode`: Control when query approval is required:
  - `always`: Require approval for all queries (default)
  - `mutate`: Only require approval for data-modifying queries (INSERT, UPDATE, DELETE, etc.)
  - `off`: No approval required

> Please note, approvalMode = mutate performs a **best effort** check to determine if the query is data-modifying based on the query and the pgsql EXPLAIN output.
> If the risk of data mutation is too high, please consider using `always` and optionally using a read-only connection string.

## Documentation

[Inferable documentation](https://docs.inferable.ai) contains all the information you need to get started with Inferable.

## Support

For support or questions, please [create an issue in the repository](https://github.com/inferablehq/inferable/issues).

## Contributing

Contributions to the Inferable PostgreSQL Adapter are welcome. Please ensure that your code adheres to the existing style and includes appropriate tests.

## License

This project is licensed under the MIT License.
