// intended to run migrations in a standalone environment such as CI

import { pool } from "../modules/data";
import { logger } from "../modules/observability/logger";
import { runMigrations } from "./migrate";

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async function run() {
  await runMigrations();
  logger.info("Migrations complete");
  await pool.end();
})();
