![Inferable Data Connector](./assets/hero.png)

Inferable Data Connector is a bridge between your data systems and [Inferable](https://inferable.ai). Configure your data sources in a json file and start conversing with your data in natural language. Works locally, and in any dockerized environment allowing connection to private resources (DB connection / API endpoints) without exposing them to the public internet.

## Features

- 🔐 **Secure Credential Handling**: Credentials (DB connection strings, API keys, etc.) never leave your environment.
- 🌐 **No incoming network access required**: The connector runs inside your network, or in your local machine, and "pulls" instructions from Inferable.
- 🧩 **Extensible**: Adding a new data source is as simple as writing a a new [function](https://docs.inferable.ai/pages/functions).
- 🔄 **Adapts to schema changes**: The connector automatically adapts to schema changes by periodically fetching the data system schema. (Table definitions, API definitions, etc.)
- 🤿 **Optional Privacy Mode**: Query outputs are never sent to the model. Instead, the function returns results directly to the end user without any model involvement.
- 🔍 **Optional Approval Mode**: Adds an additional safety layer by requiring manual approval before executing each query.

<div align="center">
  <a target="_blank" href="https://youtu.be/v0oKldk7KBc"><img width="60%" alt="walkthrough video" src="https://img.youtube.com/vi/v0oKldk7KBc/0.jpg"></a>
</div>

## Connectors

- [x] [Postgres](./src/postgres)
- [x] [MySQL](./src/mysql)
- [x] [SQLite](./src/sqlite)
- [x] [OpenAPI](./src/open-api) (Experimental)
- [x] [GraphQL](./src/graphql) (Experimental)
- [ ] [MongoDB](./src/mongodb)
- [ ] [Big Query](./src/big-query)
- [ ] [Google Sheets](./src/google-sheets)

## Quick Start

> 🔑 You will need an Inferable [Cluster API Key](https://docs.inferable.ai/pages/auth#cluster-api-keys) in order to use this connector.
> Create an [Inferable Cloud key](https://app.inferable.ai) or follow the Inferable [self-hosting guide](https://docs.inferable.ai/pages/self-hosting).

### Running with your own Postgres DB

1. Pull the docker image:

```bash
docker pull inferable/data-connector:latest
```

2. Run the docker container:

```bash
docker run -e INFERABLE_API_SECRET="sk_xxxx" \
           -e POSTGRES_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
           -e POSTGRES_SCHEMA="public" \
           --network host \
           inferable/data-connector
```

3. Open the [Inferable Playground](https://app.inferable.ai) (Or `localhost` if you're running [Inferable locally](https://docs.inferable.ai/pages/self-hosting)).

### Running with a Demo Postgres DB

1. Clone this repository

2. Rename `.env.example` to `.env` and set your Inferable API secret:

```bash
INFERABLE_API_SECRET=your_secret_here

# DEMO POSTGRES CONFIG
POSTGRES_URL=postgresql://postgres:postgres@db:5432/postgres
POSTGRES_SCHEMA=public
```

3. Run the following command:

```bash
docker-compose up --build
```

This will:

- Start a PostgreSQL database with sample data
- Launch the Inferable connector service
- Provide you with a direct link to the Inferable playground where you can start querying

4. Open the [Inferable Playground](https://app.inferable.ai) (Or `localhost` if you're running [Inferable locally](https://docs.inferable.ai/pages/self-hosting)).

#### Sample Data

The demo database comes pre-loaded with sample data (defined in `example_data/seed.ts`). You can use this to experiment with queries and understand how the connector works.

# Configuration

The connector is configured using the [`config.json`](./config.json) file.

Example configuration:

```json
{
  "privacyMode": 0,
  "approvalMode": 0,
  "connectors": [
    {
      "type": "postgres",
      "name": "myPostgres",
      "connectionString": "process.env.POSTGRES_URL",
      "schema": "process.env.POSTGRES_SCHEMA"
    }
  ]
}
```

It can be used to define multiple connectors, and allows environment variables substitution by prefixing the variable name with `process.env.`.

When running in docker, the `config.json` can be mounted to `/app/config.json` in the container.
Otherwise, the default [`config.json`](./config.json) file will be used.

## Mounting With Docker

```bash
docker run -e INFERABLE_API_SECRET="sk_xxxx" \
           -e POSTGRES_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
           -e POSTGRES_SCHEMA="public" \
           -v $PWD/config.json:/app/config.json \
           --network host \
           inferable/data-connector
```

## Mounting with Docker Compose

```yaml
version: '3'
services:
  data-connector:
    image: inferable/data-connector:latest
    configs:
      - source: connector_config
        target: /app/config.json

configs:
  connector_config:
    content: |
      {
        "privacyMode": 0,
        "approvalMode": 0,
        "connectors": [
          {
            "type": "postgres",
            "name": "myPostgres",
            "connectionString": "postgresql://postgres:postgres@postgres:5432/postgres",
            "schema": "public"
          }
        ]
      }
```

## config.connectors

Each connector is defined in the `config.connectors` array.

- `config.connectors[].type`: The type of connector. Currently only `postgres` is supported.
- `config.connectors[].name`: The name of the connector. This is the Inferable service name. One will be generated if not provided.
- `config.connectors[].privacyMode`: The privacy mode. Set to `1` to enable `privacyMode` (Overrides the value at `config.privacyMode`)
- `config.connectors[].approvalMode`: The approval mode. Set to `1` to enable `approvalMode` (Overrides the value at `config.approvalMode`)

<details>
<summary>Postgres Connector Configuration</summary>

- `config.connectors[].connectionString`: The connection string to your database. (e.g. `postgresql://postgres:postgres@localhost:5432/postgres`)
- `config.connectors[].schema`: The schema to use. (e.g. `public`)

</details>

<details>
<summary>OpenAPI Connector Configuration</summary>

- `config.connectors[].specUrl`: The URL to your OpenAPI spec. Must be publicly accessible.
- `config.connectors[].endpoint`: The endpoint to use. (e.g. `https://api.inferable.ai`)
- `config.connectors[].defaultHeaders`: The default headers to use. (e.g. `{"Authorization": "Bearer <token>"}`)
- `config.connectors[].allowedOperations`: Explicit OpenAPI operationIDs to allow.

</details>

<details>
<summary>GraphQL Connector Configuration</summary>

- `config.connectors[].schemaUrl`: The URL to your GraphQL schema. Must be publicly accessible.
- `config.connectors[].endpoint`: The endpoint to use. (e.g. `https://api.inferable.ai`)
- `config.connectors[].defaultHeaders`: The default headers to use. (e.g. `{"Authorization": "Bearer <token>"}`)

</details>

<details>
<summary>MySQL Connector Configuration</summary>

- `config.connectors[].connectionString`: The connection string to your database. (e.g. `mysql://root:mysql@localhost:3306/mysql`)
- `config.connectors[].schema`: The schema to use. (e.g. `mysql`)

</details>

<details>
<summary>SQLite Connector Configuration</summary>

- `config.connectors[].filePath`: The path to your SQLite database file. (e.g. `/path/to/your/database.sqlite`)

</details>

### config.privacyMode

When enabled (`config.privacyMode=1`), raw data is never sent to the model. Instead:

- The model generates SQL queries based on schema information
- Queries are executed locally
- Only results are returned

Note: This may limit some advanced reasoning capabilities that require direct data access.

![Privacy Mode](./assets/privacy.png)

### config.approvalMode

Adds an additional safety layer by requiring manual approval before executing any queries. Enable with `config.approvalMode=1`. This can get annoying really quickly, so we've disabled it by default.

![Approval Mode](./assets/paranoid.gif)

## Production Deployment

When deploying to production, follow these security best practices:

1. **Read-Only Access**: If you want to prevent any possibility of data mutations, use a read-only database connection string.

2. **Privacy Considerations**:

   - Enable `config.privacyMode=1` if your data security requirements prohibit sharing raw data with the model.
   - The model will still receive metadata (schema, table names, data types)

3. **Query Approval**:

- Set `config.approvalMode=1` to require manual approval of queries.
- This provides an additional layer of control over database interactions

## Architecture

- All queries execute within the dockerized environment
- Neither the model nor the Inferable Control Plane can execute queries directly
- Database schema information is used to guide query generation

## FAQ

**Q: Can this hallucinate?**
A: Any result generated by an LLM is prone to hallucination. However, we provide two means to mitigate this:

- **Privacy Mode**: Raw data is never sent to the model. Instead, the model generates SQL queries based on schema information.
- **Function results**: Any data received by the model is also visible in the function results in Playground. You can directly verify if the model's output is correct.

**Q: Can the model see my data?**
A: By default, yes, but enabling `config.privacyMode` ensures that only database metadata (schema, table names, data types) is shared with the model.

**Q: Where do the queries execute?**
A: All queries execute within your dockerized environment. Neither the model nor the Inferable Control Plane have direct query execution capabilities.

## Failure Modes

**Context Window Limitations**: The connector may face challenges with large database schemas, large OpenAPI specs, or large GraphQL schemas. In such cases, you may need to provide multiple subsets of the schema to the model via multiple `config.connectors` entries or limit the [attached operations](src/open-api#large-schemas)

**Return Data Limitations**: The connector may face latency issues with large data sets. In such cases, turning on `config.privacyMode` will prevent the model from seeing the raw data, and instead return the data directly to the user.

## Contributing

We welcome contributions! To add support for a new database:

1. Create a new connector file in `src/<connector>.ts`
2. Implement the necessary connection and query interfaces
3. Submit a pull request

We're actively working on adding more data connectors to support various database systems.

## License

This project is licensed under the MIT License. See the [LICENSE](../LICENSE) file for details.
