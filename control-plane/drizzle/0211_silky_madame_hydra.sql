ALTER TABLE "external_messages" DROP CONSTRAINT "external_messages_message_id_run_id_cluster_id_workflow_messages_id_workflow_id_cluster_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_messages" ADD CONSTRAINT "external_messages_message_id_run_id_cluster_id_workflow_messages_id_workflow_id_cluster_id_fk" FOREIGN KEY ("message_id","run_id","cluster_id") REFERENCES "public"."workflow_messages"("id","workflow_id","cluster_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
