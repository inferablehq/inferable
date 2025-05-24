ALTER TABLE "clusters" ADD COLUMN "event_expiry_age" integer;--> statement-breakpoint
ALTER TABLE "clusters" ADD COLUMN "run_expiry_age" integer;--> statement-breakpoint
ALTER TABLE "clusters" ADD COLUMN "workflow_execution_expiry_age" integer;