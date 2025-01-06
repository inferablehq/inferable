CREATE TABLE IF NOT EXISTS "external_messages" (
	"message_id" varchar(1024) NOT NULL,
	"run_id" varchar(1024) NOT NULL,
	"cluster_id" varchar NOT NULL,
	"external_id" varchar(1024) NOT NULL,
	"channel" text,
	CONSTRAINT "external_messages_pkey" PRIMARY KEY("cluster_id","external_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_messages" ADD CONSTRAINT "external_messages_message_id_run_id_cluster_id_workflow_messages_id_workflow_id_cluster_id_fk" FOREIGN KEY ("message_id","run_id","cluster_id") REFERENCES "public"."workflow_messages"("id","workflow_id","cluster_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "externalMessagesIndex" ON "external_messages" USING btree ("external_id","cluster_id");
