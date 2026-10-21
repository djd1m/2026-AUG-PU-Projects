ALTER TABLE send_job ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3);
ALTER TABLE send_job ADD COLUMN first_attempt_at timestamptz;
ALTER TABLE send_job ADD COLUMN submitting_at timestamptz;
ALTER TABLE send_job ADD COLUMN outcome text;
CREATE TABLE unsubscribe_token (
 token_hash char(64) PRIMARY KEY, job_id uuid NOT NULL REFERENCES send_job(id),
 tenant_id uuid NOT NULL REFERENCES tenant(id), mailbox_id uuid NOT NULL,
 enrollment_id uuid, recipient_hash char(64) NOT NULL, expires_at timestamptz NOT NULL,
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id),
 FOREIGN KEY(tenant_id,enrollment_id) REFERENCES enrollment(tenant_id,id)
);
CREATE TABLE local_test_message (
 job_id uuid PRIMARY KEY REFERENCES send_job(id), tenant_id uuid NOT NULL REFERENCES tenant(id),
 recipient_tenant_id uuid REFERENCES tenant(id), scope text NOT NULL CHECK(scope IN ('pool','campaign')),
 message_id text UNIQUE NOT NULL, sender text NOT NULL, recipient text NOT NULL,
 subject text NOT NULL, body text NOT NULL, headers jsonb NOT NULL,
 test_label text NOT NULL CHECK(test_label='N7 LOCAL TEST — NOT DELIVERY'),
 accepted_at timestamptz NOT NULL
);
INSERT INTO schema_migration(version) VALUES(5);
