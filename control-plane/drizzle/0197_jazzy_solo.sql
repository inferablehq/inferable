ALTER TABLE "integrations" DROP COLUMN IF EXISTS "valTown";
ALTER TABLE "integrations" ADD COLUMN "valtown" jsonb;
