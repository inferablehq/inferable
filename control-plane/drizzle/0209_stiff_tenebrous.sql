ALTER TABLE "workflows" ADD COLUMN "on_status_change_statuses" json;--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN IF EXISTS "queue_url";