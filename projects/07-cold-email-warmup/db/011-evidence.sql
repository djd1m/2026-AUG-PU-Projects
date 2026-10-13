CREATE TABLE evidence_observation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 evidence jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(tenant_id,id)
);
CREATE TABLE evidence_report (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 token text NOT NULL UNIQUE, idempotency_key text NOT NULL, baseline_id uuid NOT NULL, latest_id uuid NOT NULL,
 snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), revoked_at timestamptz,
 UNIQUE(tenant_id,idempotency_key), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,baseline_id) REFERENCES evidence_observation(tenant_id,id),
 FOREIGN KEY(tenant_id,latest_id) REFERENCES evidence_observation(tenant_id,id)
);
CREATE TABLE evidence_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 report_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('share','copy','link')), idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,report_id) REFERENCES evidence_report(tenant_id,id)
);
CREATE INDEX evidence_observation_history ON evidence_observation(tenant_id,created_at DESC,id DESC);
CREATE INDEX evidence_report_history ON evidence_report(tenant_id,created_at DESC,id DESC);
CREATE INDEX evidence_event_history ON evidence_event(tenant_id,created_at DESC,id DESC);
CREATE FUNCTION protect_evidence_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='evidence_observation' THEN RAISE EXCEPTION 'immutable evidence'; END IF;
 IF
 (NEW.id,NEW.tenant_id,NEW.token,NEW.idempotency_key,NEW.baseline_id,NEW.latest_id,NEW.snapshot,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.token,OLD.idempotency_key,OLD.baseline_id,OLD.latest_id,OLD.snapshot,OLD.created_at)
 THEN RAISE EXCEPTION 'immutable evidence'; END IF;
 IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN RAISE EXCEPTION 'immutable revocation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_observation BEFORE UPDATE ON evidence_observation FOR EACH ROW EXECUTE FUNCTION protect_evidence_snapshot();
CREATE TRIGGER immutable_report BEFORE UPDATE ON evidence_report FOR EACH ROW EXECUTE FUNCTION protect_evidence_snapshot();
INSERT INTO schema_migration(version) VALUES(11);
