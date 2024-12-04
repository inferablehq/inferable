import assert from "assert";
import { approvalRequest, blob, ContextInput, Inferable } from "inferable";
import pg from "pg";
import { z } from "zod";
import crypto from "crypto";
import type { DataConnector } from "../types";

export class PostgresClient implements DataConnector {
  private client: pg.Client | null = null;
  private initialized = false;

  constructor(
    private params: {
      name?: string;
      schema: string;
      connectionString: string;
      maxResultLength: number;
      privacyMode: boolean;
      approvalMode: boolean;
    },
  ) {
    assert(params.schema, "Schema parameter is required");
  }

  public initialize = async () => {
    try {
      const client = await this.getClient();
      const res = await client.query(`SELECT NOW() as now`);
      console.log(`Initial probe successful: ${res.rows[0].now}`);
      if (this.params.privacyMode) {
        console.log(
          "Privacy mode is enabled, table data will not be sent to the model.",
        );
      }

      process.removeListener("SIGTERM", this.handleSigterm);
      process.on("SIGTERM", this.handleSigterm);
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize database connection:", error);
      throw error;
    }
  };

  private handleSigterm = async () => {
    if (this.client) {
      await this.client.end();
    }
  };

  private getClient = async () => {
    if (!this.client) {
      this.client = new pg.Client({
        connectionString: this.params.connectionString,
        ssl: false,
      });

      await this.client.connect();

      return this.client;
    }

    return this.client;
  };

  private getAllTables = async () => {
    const client = await this.getClient();
    const res = await client.query(
      "SELECT * FROM pg_catalog.pg_tables WHERE schemaname = $1",
      [this.params.schema],
    );
    return res.rows;
  };

  getPostgresContext = async () => {
    if (!this.initialized) throw new Error("Database not initialized");
    const client = await this.getClient();
    const tables = await this.getAllTables();

    const context: any[] = [];

    for (const table of tables) {
      const sample = await client.query(
        `SELECT * FROM ${this.params.schema}.${table.tablename} LIMIT 1`,
      );

      if (sample.rows.length > 0) {
        const columns = Object.keys(sample.rows[0]);
        const tableContext = {
          tableName: table.tablename.substring(0, 100),
          columns: columns.map((col) => col.substring(0, 100)),
          sampleData: this.params.privacyMode
            ? []
            : sample.rows.map((row) =>
                Object.values(row).map((value) =>
                  String(value).substring(0, 50),
                ),
              )[0],
        };
        context.push(tableContext);
      } else {
        context.push({
          tableName: table.tablename.substring(0, 100),
          columns: [],
          sampleData: [],
        });
      }
    }

    return context;
  };

  executePostgresQuery = async (
    input: { query: string },
    ctx: ContextInput,
  ) => {
    if (this.params.approvalMode) {
      if (!ctx.approved) {
        console.log("Query requires approval");
        return approvalRequest();
      } else {
        console.log("Query approved");
      }
    }

    if (!this.initialized) throw new Error("Database not initialized");
    const client = await this.getClient();
    const res = await client.query(input.query);

    if (this.params.privacyMode) {
      return {
        message:
          "This query was executed in privacy mode. Data was returned to the user directly.",
        blob: blob({
          name: "Results",
          type: "application/json",
          data: res.rows,
        }),
      };
    }

    if (JSON.stringify(res.rows).length > this.params.maxResultLength) {
      return {
        message:
          "This query returned too much data. Data was returned to the user directly.",
        blob: blob({
          name: "Results",
          type: "application/json",
          data: res.rows,
        }),
      };
    }

    return res.rows;
  };

  private connectionStringHash = () => {
    return crypto
      .createHash("sha256")
      .update(this.params.connectionString)
      .digest("hex")
      .substring(0, 8);
  };

  createService = (client: Inferable) => {
    const service = client.service({
      name:
        this.params.name ?? `postgres_database_${this.connectionStringHash()}`,
    });

    service.register({
      name: "getPostgresContext",
      func: this.getPostgresContext,
      description: "Gets the schema of the database.",
    });

    service.register({
      name: "executePostgresQuery",
      func: this.executePostgresQuery,
      description:
        "Executes a raw SQL query. If this fails, you need to getContext to learn the schema first.",
      schema: {
        input: z.object({
          query: z.string().describe("The query to execute"),
        }),
      },
    });

    return service;
  };
}
