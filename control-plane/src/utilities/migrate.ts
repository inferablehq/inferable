import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createMutex, db } from "../modules/data";
import { logger } from "../modules/observability/logger";

const mutex = createMutex("db-migration");
export async function runMigrations() {
  logger.debug("Migrating database...");

  const unlock = await mutex.tryLock();

  if (!unlock) {
    logger.info("Could not acquire lock, skipping database migration.");
    return;
  }

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    logger.debug("Database migrated successfully");
  } catch (e) {
    logger.error("Error migrating database", {
      error: e,
    });
    process.exit(1);
  } finally {
    await unlock();
  }
}
