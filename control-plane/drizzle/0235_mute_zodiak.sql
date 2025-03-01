ALTER TABLE "cluster_kv" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE "cluster_kv" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();
