import assert from "assert";
import { approvalRequest, blob, ContextInput, Inferable } from "inferable";
import mysql from "mysql2/promise";
import { z } from "zod";
import crypto from "crypto";
import type { DataConnector } from "../types";

export class MySQLClient implements DataConnector {
  private connection: mysql.Connection | null = null;
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
      const connection = await this.getConnection();
      const [rows] = await connection.query("SELECT NOW() as now");
      console.log(`Initial probe successful: ${(rows as any)[0].now}`);
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
    if (this.connection) {
      await this.connection.end();
    }
  };

  private getConnection = async () => {
    if (!this.connection) {
      this.connection = await mysql.createConnection(
        this.params.connectionString,
      );
      return this.connection;
    }

    return this.connection;
  };

  private getAllTables = async () => {
    const connection = await this.getConnection();
    const [rows] = await connection.query(
      "SELECT TABLE_NAME as tablename FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
      [this.params.schema],
    );
    return rows as any[];
  };

  getMysqlContext = async () => {
    if (!this.initialized) throw new Error("Database not initialized");
    const connection = await this.getConnection();
    const tables = await this.getAllTables();

    const context: any[] = [];

    for (const table of tables) {
      const [rows] = await connection.query(
        `SELECT * FROM ${this.params.schema}.${table.tablename} LIMIT 1`,
      );

      if ((rows as any[]).length > 0) {
        const columns = Object.keys((rows as any[])[0]);
        const tableContext = {
          tableName: table.tablename.substring(0, 100),
          columns: columns.map((col) => col.substring(0, 100)),
          sampleData: this.params.privacyMode
            ? []
            : (rows as any[]).map((row) =>
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

  executeMysqlQuery = async (input: { query: string }, ctx: ContextInput) => {
    if (this.params.approvalMode) {
      if (!ctx.approved) {
        console.log("Query requires approval");
        return approvalRequest();
      } else {
        console.log("Query approved");
      }
    }

    if (!this.initialized) throw new Error("Database not initialized");
    const connection = await this.getConnection();
    const [rows] = await connection.query(input.query);

    if (this.params.privacyMode) {
      return {
        message:
          "This query was executed in privacy mode. Data was returned to the user directly.",
        blob: blob({
          name: "Results",
          type: "application/json",
          data: rows,
        }),
      };
    }

    if (JSON.stringify(rows).length > this.params.maxResultLength) {
      return {
        message:
          "This query returned too much data. Data was returned to the user directly.",
        blob: blob({
          name: "Results",
          type: "application/json",
          data: rows,
        }),
      };
    }

    return rows;
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
      name: this.params.name ?? `mysql_database_${this.connectionStringHash()}`,
    });

    service.register({
      name: "getMysqlContext",
      func: this.getMysqlContext,
      description: "Gets the schema of the database.",
    });

    service.register({
      name: "executeMysqlQuery",
      func: this.executeMysqlQuery,
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
