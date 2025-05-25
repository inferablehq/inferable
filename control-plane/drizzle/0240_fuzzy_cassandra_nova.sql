ALTER TABLE "jobs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clusters" DROP COLUMN IF EXISTS "run_expiry_age";