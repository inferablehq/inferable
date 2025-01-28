ALTER TABLE "workflow_messages" RENAME TO "run_messages";--> statement-breakpoint
ALTER TABLE "external_messages" DROP CONSTRAINT "external_messages_message_id_run_id_cluster_id_workflow_messages_id_run_id_cluster_id_fk";
--> statement-breakpoint
ALTER TABLE "run_messages" DROP CONSTRAINT "workflow_messages_run_id_cluster_id_workflows_id_cluster_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_messages" ADD CONSTRAINT "external_messages_message_id_run_id_cluster_id_run_messages_id_run_id_cluster_id_fk" FOREIGN KEY ("message_id","run_id","cluster_id") REFERENCES "public"."run_messages"("id","run_id","cluster_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "run_messages" ADD CONSTRAINT "run_messages_run_id_cluster_id_workflows_id_cluster_id_fk" FOREIGN KEY ("run_id","cluster_id") REFERENCES "public"."workflows"("id","cluster_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
