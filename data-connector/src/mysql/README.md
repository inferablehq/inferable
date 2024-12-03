# MySQL Data Connector

The MySQL Data Connector enables LLMs to interact with MySQL databases through Inferable by providing schema understanding and query execution capabilities.

## Request Configuration

Configure the connector in your `config.json`:

```json
{
  "type": "mysql",
  "name": "myMysql",
  "connectionString": "process.env.MYSQL_URL",
  "schema": "process.env.MYSQL_SCHEMA"
}
```

## How It Works

The connector operates in two main phases:

1. **Schema Discovery**: When initialized, it analyzes the database structure and provides context to the LLM
2. **Query Execution**: Based on the schema understanding, it can execute SQL queries while respecting privacy and security settings

```mermaid
sequenceDiagram
    participant LLM as LLM Agent
    participant Connector as MySQL Connector
    participant DB as MySQL DB

    %% Schema Discovery
    LLM->>Connector: getMysqlContext()
    Connector->>DB: Query table structure
    DB-->>Connector: Return schema info
    Connector-->>LLM: Tables & columns context

    %% Query Execution
    LLM->>Connector: executeMysqlQuery()
    alt Paranoid Mode
        Connector->>Human: Request approval
        Human-->>Connector: Approve query
    end
    Connector->>DB: Execute SQL query
    DB-->>Connector: Return results
    alt Privacy Mode
        Connector-->>User: Direct data transfer
        Connector-->>LLM: Confirmation only
    else Normal Mode
        Connector-->>LLM: Query results
    end
```

## Features

- **Schema Analysis**: Automatically maps database structure for LLM context
- **Privacy Mode**: Prevents sensitive data from passing through the LLM
- **Paranoid Mode**: Requires human approval for query execution
- **Sample Data**: Provides example rows to help LLM understand data patterns

## Important Considerations

### Context Window Limitations

The connector may face challenges with large database schemas:

```typescript
// Example context structure
{
  tableName: "users",
  columns: ["id", "name", "email"],
  sampleData: ["1", "John Doe", "john@example.com"]
}
```

**Solution**: If you have many tables, create a refined schema focusing on relevant tables:

```sql
CREATE DATABASE llm_visible;
GRANT ALL PRIVILEGES ON llm_visible.* TO 'your_user'@'localhost';
-- Create views of only the necessary tables
CREATE VIEW llm_visible.users AS SELECT * FROM main_database.users;
```

### Data Privacy

Large result sets passing through the LLM can:

- Consume excessive tokens
- Expose sensitive data
- Cause context overflow

**Solution**: Enable privacy mode to send data directly to the user:

```typescript
new MySQLClient({
  connectionString: "mysql://user:pass@localhost:3306/database",
  schema: "your_schema",
  privacyMode: true,
});
```

### Connection Management

The connector automatically handles:

- Connection initialization and verification
- Graceful shutdown on SIGTERM signals
- Connection pooling and reuse
