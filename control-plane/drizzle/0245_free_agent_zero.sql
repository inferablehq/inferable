DROP TABLE "embeddings";--> statement-breakpoint
DROP INDEX IF EXISTS "clusterServiceStatusIndex";--> statement-breakpoint
DROP INDEX IF EXISTS "clusterServiceStatusFnIndex";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "service";