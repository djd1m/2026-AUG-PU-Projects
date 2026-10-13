CREATE TABLE share (
 token text PRIMARY KEY CHECK(token ~ '^[A-Za-z0-9_-]{43}$'),
 job_id uuid NOT NULL REFERENCES job(id), published boolean NOT NULL DEFAULT true,
 source_context text NOT NULL CHECK(length(source_context) BETWEEN 1 AND 160),
 description text NOT NULL CHECK(length(description) BETWEEN 40 AND 2000),
 style text NOT NULL CHECK(style IN ('warm','minimal','afrohemian','playful')),
 input_sha text NOT NULL CHECK(input_sha ~ '^[a-f0-9]{64}$'),
 output_sha text NOT NULL CHECK(output_sha ~ '^[a-f0-9]{64}$'),
 evidence_sha text NOT NULL CHECK(evidence_sha ~ '^[a-f0-9]{64}$'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), revoked_at timestamptz,
 CHECK(published=(revoked_at IS NULL))
);
CREATE UNIQUE INDEX share_one_active_job ON share(job_id) WHERE published;
CREATE INDEX share_public_page ON share(created_at DESC,token DESC) WHERE published;
CREATE TABLE share_action (
 account_id uuid NOT NULL REFERENCES account(id), job_id uuid NOT NULL REFERENCES job(id),
 event_key uuid NOT NULL, mode text NOT NULL CHECK(mode IN ('native','download')),
 artifact_sha text CHECK(artifact_sha ~ '^[a-f0-9]{64}$'),
 outcome text CHECK(outcome IN ('resolved','abort','error','unavailable')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,job_id,event_key), CHECK(outcome IS NULL OR mode='native')
);
-- Runs within the existing account -> job transition: immediate atomic revocation,
-- with no new ledger effects or job-first/account lock path.
CREATE FUNCTION revoke_job_shares() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.deleted_at IS NOT NULL OR NEW.quality='rejected' THEN
  UPDATE share SET published=false,revoked_at=clock_timestamp(),version=version+1
   WHERE job_id=NEW.id AND published;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER revoke_job_shares AFTER UPDATE OF deleted_at,quality ON job
 FOR EACH ROW EXECUTE FUNCTION revoke_job_shares();
