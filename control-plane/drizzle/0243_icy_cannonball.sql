DROP TABLE "external_messages";--> statement-breakpoint
ALTER TABLE "clusters" DROP COLUMN IF EXISTS "enable_custom_auth";--> statement-breakpoint
ALTER TABLE "clusters" DROP COLUMN IF EXISTS "handle_custom_auth_function";--> statement-breakpoint
ALTER TABLE "clusters" DROP COLUMN IF EXISTS "enable_knowledgebase";--> statement-breakpoint
ALTER TABLE "clusters" DROP COLUMN IF EXISTS "additional_context";--> statement-breakpoint
ALTER TABLE "integrations" DROP COLUMN IF EXISTS "toolhouse";--> statement-breakpoint
ALTER TABLE "integrations" DROP COLUMN IF EXISTS "tavily";--> statement-breakpoint
ALTER TABLE "integrations" DROP COLUMN IF EXISTS "valtown";--> statement-breakpoint
ALTER TABLE "integrations" DROP COLUMN IF EXISTS "email";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN IF EXISTS "enable_summarization";
