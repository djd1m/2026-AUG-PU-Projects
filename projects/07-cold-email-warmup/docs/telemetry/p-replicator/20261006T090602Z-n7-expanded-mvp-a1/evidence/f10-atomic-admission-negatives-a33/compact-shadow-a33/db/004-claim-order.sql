-- Rotation uses serialized claim order; timestamps retain lease/freshness semantics.
CREATE SEQUENCE send_job_claim_order_seq AS bigint;
ALTER TABLE send_job ADD COLUMN claim_order bigint;
ALTER SEQUENCE send_job_claim_order_seq OWNED BY send_job.claim_order;
INSERT INTO schema_migration(version) VALUES(4);
