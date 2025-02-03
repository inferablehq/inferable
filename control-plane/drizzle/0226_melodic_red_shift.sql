CREATE TABLE IF NOT EXISTS "cluster_kv" (
	"cluster_id" varchar NOT NULL,
	"key" varchar(1024) NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "cluster_kv_cluster_id_key_pk" PRIMARY KEY("cluster_id","key")
);
