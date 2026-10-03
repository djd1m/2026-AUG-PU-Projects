CREATE TABLE public_stop_bucket (
 ip text NOT NULL, window_start timestamptz NOT NULL, attempts integer NOT NULL,
 PRIMARY KEY(ip,window_start)
);
CREATE TABLE complaint_event (
 event_id text PRIMARY KEY, tenant_id uuid NOT NULL, mailbox_id uuid NOT NULL,
 recipient_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id)
);
CREATE TABLE local_reply_fixture (
 tenant_id uuid NOT NULL, mailbox_id uuid PRIMARY KEY, uidvalidity text NOT NULL,
 uid_next bigint NOT NULL CHECK(uid_next BETWEEN 1 AND 4294967295),
 next_poll_at timestamptz NOT NULL DEFAULT now(),
 headers jsonb NOT NULL, failed boolean NOT NULL DEFAULT false,
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id)
);
INSERT INTO schema_migration(version) VALUES(8);
