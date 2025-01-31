CREATE TABLE IF NOT EXISTS "workflow_executions" (
	"id" varchar(1024) NOT NULL,
	"cluster_id" varchar NOT NULL,
	"workflow_execution_id" varchar(1024) NOT NULL,
	"version" integer NOT NULL,
	"workflow_name" varchar(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" varchar(1024),
	CONSTRAINT "workflow_executions_pkey" PRIMARY KEY("cluster_id","id")
);
--> statement-breakpoint
DROP TABLE "workflow_definitions";--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "type" text DEFAULT 'tool' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "http_trigger_endpoint" varchar(1024);