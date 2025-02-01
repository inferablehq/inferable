ALTER TABLE "workflow_executions" ALTER COLUMN "job_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "on_status_change" json;--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN IF EXISTS "result_function";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN IF EXISTS "on_status_change_statuses";--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN IF EXISTS "type";