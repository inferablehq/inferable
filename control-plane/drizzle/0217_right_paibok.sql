ALTER TABLE "workflow_metadata" RENAME TO "run_tags";--> statement-breakpoint
ALTER TABLE "run_tags" DROP CONSTRAINT "workflow_metadata_run_id_cluster_id_workflows_id_cluster_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "run_tags" ADD CONSTRAINT "run_tags_run_id_cluster_id_workflows_id_cluster_id_fk" FOREIGN KEY ("run_id","cluster_id") REFERENCES "public"."workflows"("id","cluster_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
