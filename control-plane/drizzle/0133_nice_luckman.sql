CREATE INDEX IF NOT EXISTS "clusters_id_org_index" ON "clusters" USING btree ("id","organization_id");