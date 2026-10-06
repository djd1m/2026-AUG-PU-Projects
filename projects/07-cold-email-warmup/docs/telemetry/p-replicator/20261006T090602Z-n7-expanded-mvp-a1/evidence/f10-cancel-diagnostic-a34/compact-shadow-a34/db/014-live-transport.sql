ALTER TABLE mailbox ADD COLUMN transport_revision bigint NOT NULL DEFAULT 0 CHECK(transport_revision>=0);
CREATE TABLE transport_grant (
 tenant_id uuid NOT NULL, mailbox_id uuid PRIMARY KEY, revision bigint NOT NULL CHECK(revision>0),
 state text NOT NULL CHECK(state IN ('active','revoked')), scope jsonb,
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id),
 CHECK((state='active' AND scope IS NOT NULL) OR (state='revoked' AND scope IS NULL))
);
CREATE TABLE transport_operation (
 protocol text NOT NULL CHECK(protocol IN ('smtp','imap')), slot integer NOT NULL,
 operation uuid, tenant_id uuid, mailbox_id uuid, owner_process uuid, owner_host text, expires_at timestamptz,
 PRIMARY KEY(protocol,slot), FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id),
 CHECK(slot BETWEEN 1 AND CASE WHEN protocol='smtp' THEN 2 ELSE 4 END),
 CHECK((operation IS NULL AND tenant_id IS NULL AND mailbox_id IS NULL AND owner_process IS NULL AND owner_host IS NULL AND expires_at IS NULL)
 OR (operation IS NOT NULL AND tenant_id IS NOT NULL AND mailbox_id IS NOT NULL AND owner_process IS NOT NULL AND owner_host IS NOT NULL AND expires_at IS NOT NULL))
);
CREATE UNIQUE INDEX transport_mailbox_occupied ON transport_operation(protocol,mailbox_id) WHERE operation IS NOT NULL;
INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4);
ALTER TABLE send_job ADD COLUMN transport_mode text CHECK(transport_mode IN ('local_test','protocol_fixture','live_provider'));
ALTER TABLE send_job ADD COLUMN transport_grant_revision bigint;
ALTER TABLE send_job ADD COLUMN transport_mailbox_revision bigint;
CREATE TABLE transport_receipt (
 job_id uuid NOT NULL REFERENCES send_job(id),attempt_count integer NOT NULL,
 tenant_id uuid NOT NULL REFERENCES tenant(id),message_id text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('local_test','protocol_fixture','live_provider')), accepted_at timestamptz NOT NULL,
 PRIMARY KEY(job_id,attempt_count)
);
INSERT INTO schema_migration(version) VALUES(14);
