ALTER TABLE "workflow_messages" RENAME COLUMN "workflow_id" TO "run_id";--> statement-breakpoint
ALTER TABLE "external_messages" DROP CONSTRAINT "external_messages_message_id_run_id_cluster_id_workflow_messages_id_workflow_id_cluster_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_messages" DROP CONSTRAINT "workflow_messages_workflow_id_cluster_id_workflows_id_cluster_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_messages" DROP CONSTRAINT "workflow_messages_cluster_id_workflow_id_id";--> statement-breakpoint
ALTER TABLE "workflow_messages" ADD CONSTRAINT "run_messages_cluster_id_run_id_id" PRIMARY KEY("cluster_id","run_id","id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_messages" ADD CONSTRAINT "external_messages_message_id_run_id_cluster_id_workflow_messages_id_run_id_cluster_id_fk" FOREIGN KEY ("message_id","run_id","cluster_id") REFERENCES "public"."workflow_messages"("id","run_id","cluster_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_messages" ADD CONSTRAINT "workflow_messages_run_id_cluster_id_workflows_id_cluster_id_fk" FOREIGN KEY ("run_id","cluster_id") REFERENCES "public"."workflows"("id","cluster_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
