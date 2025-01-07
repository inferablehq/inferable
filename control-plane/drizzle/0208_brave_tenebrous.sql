ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;
