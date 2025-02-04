CREATE TABLE IF NOT EXISTS "tools" (
	"cluster_id" varchar NOT NULL,
	"name" varchar(1024) NOT NULL,
	"group" varchar(1024) NOT NULL,
	"description" text,
	"schema" text,
	"config" json,
	"hash" text NOT NULL,
	"should_expire" boolean NOT NULL,
	"last_ping_at" timestamp with time zone NOT NULL,
	"embedding_1024" vector(1024) NOT NULL,
	"embedding_model" text NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tools_cluster_id_tools" PRIMARY KEY("cluster_id","name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tools" ADD CONSTRAINT "tools_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "toolEmbedding1024Index" ON "tools" USING hnsw ("embedding_1024" vector_cosine_ops);