ALTER TABLE "prompt_templates" RENAME TO "agents";--> statement-breakpoint
ALTER TABLE "workflows" RENAME COLUMN "config_id" TO "agent_id";--> statement-breakpoint
ALTER TABLE "workflows" RENAME COLUMN "config_version" TO "agent_version";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "prompt_templates_cluster_id_clusters_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents" ADD CONSTRAINT "agents_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
