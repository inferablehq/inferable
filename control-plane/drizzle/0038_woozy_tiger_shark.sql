ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "predictive_retry_count" integer DEFAULT 0;