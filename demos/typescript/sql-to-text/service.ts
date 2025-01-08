import { Inferable } from "inferable";
import { z } from "zod";
import { apiSecret } from "../secret";
import db from "./seed";

const client = new Inferable({
  apiSecret,
});

const service = client.service({
  name: "sqlite",
});

service.register({
  name: "getDatabaseContext",
  func: async () => {
    console.log("SQLite: Getting database context");

    return {
      tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),
      schema: db.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all(),
    };
  },
  schema: {
    input: z.object({}),
  },
});

service.register({
  name: "executeSql",
  func: async (input: { sql: string }) => {
    console.log("SQLite: Executing SQL", input.sql);

    const mutation =
      input.sql.includes("UPDATE") || input.sql.includes("INSERT") || input.sql.includes("DELETE");

    if (mutation) {
      return db.prepare(input.sql).run();
    } else {
      return db.prepare(input.sql).all();
    }
  },
  schema: {
    input: z.object({
      sql: z.string(),
    }),
  },
});

export default service;
