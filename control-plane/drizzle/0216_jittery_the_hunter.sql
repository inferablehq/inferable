ALTER TABLE "blobs" RENAME COLUMN "workflow_id" TO "run_id";--> statement-breakpoint
ALTER TABLE "blobs" DROP CONSTRAINT "blobs_cluster_id_workflow_id_workflows_cluster_id_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blobs" ADD CONSTRAINT "blobs_cluster_id_run_id_workflows_cluster_id_id_fk" FOREIGN KEY ("cluster_id","run_id") REFERENCES "public"."workflows"("cluster_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
