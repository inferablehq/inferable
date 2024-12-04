import assert from "assert";
import { approvalRequest, blob, ContextInput, Inferable } from "inferable";
import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import { z } from "zod";
import crypto from "crypto";
import type { DataConnector } from "../types";

export class SQLiteClient implements DataConnector {
  private db: Database | null = null;
  private initialized = false;

  constructor(
    private params: {
      name?: string;
      filePath: string;
      maxResultLength: number;
      privacyMode: boolean;
      paranoidMode: boolean;
    },
  ) {
    assert(params.filePath, "File path parameter is required");
  }

  public initialize = async () => {
    try {
      const db = await this.getConnection();
      const res = await db.get("SELECT datetime('now') as now");
      console.log(`Initial probe successful: ${res?.now}`);
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
    if (this.db) {
      await this.db.close();
    }
  };

  private getConnection = async () => {
    if (!this.db) {
      this.db = await open({
        filename: this.params.filePath,
        driver: sqlite3.Database,
      });
      return this.db;
    }

    return this.db;
  };

  private getAllTables = async () => {
    const db = await this.getConnection();
    const rows = await db.all(
      "SELECT name as tablename FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    return rows;
  };

  getSqliteContext = async () => {
    if (!this.initialized) throw new Error("Database not initialized");
    const db = await this.getConnection();
    const tables = await this.getAllTables();

    const context: any[] = [];

    for (const table of tables) {
      const rows = await db.all(`SELECT * FROM ${table.tablename} LIMIT 1`);

      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const tableContext = {
          tableName: table.tablename.substring(0, 100),
          columns: columns.map((col) => col.substring(0, 100)),
          sampleData: this.params.privacyMode
            ? []
            : rows.map((row) =>
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

  executeSqliteQuery = async (input: { query: string }, ctx: ContextInput) => {
    if (this.params.paranoidMode) {
      if (!ctx.approved) {
        console.log("Query requires approval");
        return approvalRequest();
      } else {
        console.log("Query approved");
      }
    }

    if (!this.initialized) throw new Error("Database not initialized");
    const db = await this.getConnection();
    const rows = await db.all(input.query);

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

  private filePathHash = () => {
    return crypto
      .createHash("sha256")
      .update(this.params.filePath)
      .digest("hex")
      .substring(0, 8);
  };

  createService = (client: Inferable) => {
    const service = client.service({
      name: this.params.name ?? `sqlite_database_${this.filePathHash()}`,
    });

    service.register({
      name: "getSqliteContext",
      func: this.getSqliteContext,
      description: "Gets the schema of the database.",
    });

    service.register({
      name: "executeSqliteQuery",
      func: this.executeSqliteQuery,
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
