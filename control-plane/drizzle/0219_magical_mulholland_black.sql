ALTER TABLE "workflows" RENAME TO "runs";--> statement-breakpoint
ALTER TABLE "blobs" DROP CONSTRAINT "blobs_cluster_id_run_id_workflows_cluster_id_id_fk";
--> statement-breakpoint
ALTER TABLE "run_messages" DROP CONSTRAINT "run_messages_run_id_cluster_id_workflows_id_cluster_id_fk";
--> statement-breakpoint
ALTER TABLE "run_tags" DROP CONSTRAINT "run_tags_run_id_cluster_id_workflows_id_cluster_id_fk";
--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "workflows_cluster_id_clusters_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blobs" ADD CONSTRAINT "blobs_cluster_id_run_id_runs_cluster_id_id_fk" FOREIGN KEY ("cluster_id","run_id") REFERENCES "public"."runs"("cluster_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "run_messages" ADD CONSTRAINT "run_messages_run_id_cluster_id_runs_id_cluster_id_fk" FOREIGN KEY ("run_id","cluster_id") REFERENCES "public"."runs"("id","cluster_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "run_tags" ADD CONSTRAINT "run_tags_run_id_cluster_id_runs_id_cluster_id_fk" FOREIGN KEY ("run_id","cluster_id") REFERENCES "public"."runs"("id","cluster_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
