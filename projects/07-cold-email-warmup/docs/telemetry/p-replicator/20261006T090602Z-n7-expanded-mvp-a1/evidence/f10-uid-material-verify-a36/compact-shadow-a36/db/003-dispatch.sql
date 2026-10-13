ALTER TABLE campaign DROP CONSTRAINT campaign_state_check;
ALTER TABLE campaign ADD CONSTRAINT campaign_state_check CHECK(state IN ('draft','active','paused'));
ALTER TABLE campaign ADD COLUMN steps jsonb NOT NULL DEFAULT '[]';
UPDATE campaign SET steps=jsonb_build_array(jsonb_build_object('subject','N7 campaign','body',content,'delayHours',24));
ALTER TABLE campaign ADD COLUMN personalization jsonb NOT NULL DEFAULT '{}';
CREATE TABLE enrollment (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, campaign_id uuid NOT NULL, campaign_version integer NOT NULL,
 recipient_envelope jsonb NOT NULL, recipient_hash char(64) NOT NULL, fields jsonb NOT NULL,
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','replied','suppressed','cancelled')),
 UNIQUE(campaign_id,campaign_version,recipient_hash), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,campaign_id) REFERENCES campaign(tenant_id,id)
);
CREATE TABLE mailbox_poll (
 mailbox_id uuid PRIMARY KEY REFERENCES mailbox(id), completed_at timestamptz,
 scan_complete boolean NOT NULL DEFAULT false, uidvalidity text, cursor_uid bigint
);
CREATE TABLE suppression (
 tenant_id uuid NOT NULL REFERENCES tenant(id), recipient_hash char(64) NOT NULL,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,recipient_hash)
);
ALTER TABLE send_job ADD COLUMN enrollment_id uuid;
ALTER TABLE send_job ADD CONSTRAINT job_enrollment FOREIGN KEY(tenant_id,enrollment_id) REFERENCES enrollment(tenant_id,id);
ALTER TABLE send_job ADD COLUMN campaign_version integer;
ALTER TABLE send_job ADD COLUMN step integer;
ALTER TABLE send_job ADD COLUMN due_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE send_job ADD COLUMN kind text NOT NULL DEFAULT 'initial' CHECK(kind IN ('initial','reply'));
ALTER TABLE send_job ADD COLUMN pair_key text;
ALTER TABLE send_job ADD COLUMN parent_id uuid REFERENCES send_job(id);
ALTER TABLE send_job ADD COLUMN payload jsonb;
ALTER TABLE send_job ADD COLUMN lease_owner uuid;
ALTER TABLE send_job ADD COLUMN lease_until timestamptz;
ALTER TABLE send_job ADD COLUMN reserved_day date;
ALTER TABLE send_job ADD COLUMN claimed_at timestamptz;
ALTER TABLE send_job ADD COLUMN message_id text;
CREATE UNIQUE INDEX campaign_step_once ON send_job(campaign_id,enrollment_id,step) WHERE enrollment_id IS NOT NULL;
CREATE UNIQUE INDEX pool_pair_day_once ON send_job(pair_key) WHERE scope='pool' AND kind='initial';
CREATE UNIQUE INDEX pool_parent_reply_once ON send_job(parent_id) WHERE kind='reply';
ALTER TABLE send_job ADD CONSTRAINT reply_parent CHECK((kind='reply' AND parent_id IS NOT NULL) OR (kind='initial' AND parent_id IS NULL));
CREATE INDEX due_jobs ON send_job(due_at,mailbox_id) WHERE state='queued';
CREATE INDEX reservation_jobs ON send_job(mailbox_id,reserved_day) WHERE reserved_day IS NOT NULL;
-- Central release covers existing F02 cancellation writers without changing them.
-- Irreversible submitting/submitted/unknown reservations remain charged indefinitely for their UTC day.
CREATE FUNCTION release_cancelled_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='cancelled' AND OLD.state IN ('queued','claimed') THEN
  NEW.reserved_day=NULL; NEW.lease_owner=NULL; NEW.lease_until=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER release_cancelled_reservation BEFORE UPDATE OF state ON send_job
 FOR EACH ROW EXECUTE FUNCTION release_cancelled_reservation();
INSERT INTO schema_migration(version) VALUES(3);
