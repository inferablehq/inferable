ALTER TABLE "jobs" ALTER COLUMN "service" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "service";