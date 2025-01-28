ALTER TABLE "workflow_metadata" RENAME COLUMN "workflow_id" TO "run_id";--> statement-breakpoint
ALTER TABLE "workflow_metadata" DROP CONSTRAINT "workflow_metadata_workflow_id_cluster_id_workflows_id_cluster_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "workflowMetadataIndex";--> statement-breakpoint
ALTER TABLE "workflow_metadata" DROP CONSTRAINT "workflow_metadata_cluster_id_workflow_id_key";--> statement-breakpoint
ALTER TABLE "workflow_metadata" ADD CONSTRAINT "run_tags_cluster_id_run_id_key" PRIMARY KEY("cluster_id","run_id","key");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_metadata" ADD CONSTRAINT "workflow_metadata_run_id_cluster_id_workflows_id_cluster_id_fk" FOREIGN KEY ("run_id","cluster_id") REFERENCES "public"."workflows"("id","cluster_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runTagsIndex" ON "workflow_metadata" USING btree ("key","value","cluster_id");
