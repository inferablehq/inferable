import { z } from "zod";
import db from "./seed";
import { Inferable } from "inferable";

export const register = (client: Inferable) => {
  client.tools.register({
    name: "getDatabaseContext",
    description: "Gets the database context, which includes the tables and schema.",
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

  client.tools.register({
    name: "executeSql",
    description:
    "Executes a SQL query on the database. If you don't know the schema, use getDatabaseContext first.",
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
}
