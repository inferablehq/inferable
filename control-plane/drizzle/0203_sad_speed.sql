ALTER TABLE "jobs" ALTER COLUMN "remaining_attempts" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "machines" DROP COLUMN IF EXISTS "status";