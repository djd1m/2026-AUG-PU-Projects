-- Physical delivery, optional Message-ID ledger and semantic stop are separate identities.
CREATE TABLE reply_observation (
 tenant_id uuid NOT NULL, mailbox_id uuid NOT NULL, uidvalidity text NOT NULL,
 uid bigint NOT NULL CHECK(uid BETWEEN 1 AND 4294967295), message_id text,
 PRIMARY KEY(mailbox_id,uidvalidity,uid),
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id)
);
CREATE TABLE reply_message (
 tenant_id uuid NOT NULL, mailbox_id uuid NOT NULL, message_id text NOT NULL,
 PRIMARY KEY(mailbox_id,message_id),
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id)
);
CREATE TABLE reply_effect (
 tenant_id uuid NOT NULL, mailbox_id uuid NOT NULL, enrollment_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind='reply'), created_at timestamptz NOT NULL,
 PRIMARY KEY(mailbox_id,enrollment_id,kind),
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id),
 FOREIGN KEY(tenant_id,enrollment_id) REFERENCES enrollment(tenant_id,id)
);
CREATE TABLE reply_rescan (
 tenant_id uuid NOT NULL, mailbox_id uuid PRIMARY KEY, run_id uuid NOT NULL UNIQUE,
 uidvalidity text NOT NULL, high_water bigint NOT NULL CHECK(high_water BETWEEN 0 AND 4294967295),
 cursor_uid bigint NOT NULL DEFAULT 0 CHECK(cursor_uid BETWEEN 0 AND 4294967295),
 state text NOT NULL CHECK(state IN ('scanning','rescan_incomplete','complete')),
 attempt integer NOT NULL DEFAULT 1 CHECK(attempt>0),
 attempt_started_at timestamptz NOT NULL, pages integer NOT NULL DEFAULT 0 CHECK(pages BETWEEN 0 AND 20),
 provenance text NOT NULL CHECK(provenance IN ('local_fixture','imap_headers')),
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id)
);
CREATE INDEX reply_own_message ON send_job(tenant_id,mailbox_id,message_id) WHERE message_id IS NOT NULL;
INSERT INTO schema_migration(version) VALUES(6);
