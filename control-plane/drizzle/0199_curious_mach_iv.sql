UPDATE "jobs" SET "workflow_id" = 'unknown' WHERE "workflow_id" IS NULL;
ALTER TABLE "jobs" ALTER COLUMN "workflow_id" SET NOT NULL;
