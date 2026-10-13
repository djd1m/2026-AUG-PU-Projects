CREATE SEQUENCE runtime_service_seq;
CREATE TABLE runtime_reconcile (
 id integer PRIMARY KEY CHECK(id=1), after_created_at timestamptz, after_mailbox uuid,
 CHECK((after_created_at IS NULL)=(after_mailbox IS NULL))
);
INSERT INTO runtime_reconcile(id) VALUES(1);
CREATE INDEX runtime_connected_page ON mailbox(created_at,id) WHERE credential_envelope IS NOT NULL;

CREATE TABLE runtime_tenant_turn (
 tenant_id uuid NOT NULL REFERENCES tenant(id), kind text NOT NULL CHECK(kind IN ('poll','pool','dispatch','capacity')),
 service_seq bigint NOT NULL DEFAULT 0, PRIMARY KEY(tenant_id,kind)
);
CREATE TABLE runtime_mailbox (
 tenant_id uuid NOT NULL, mailbox_id uuid PRIMARY KEY, next_smtp_at timestamptz NOT NULL DEFAULT 'epoch',
 pool_peer_after uuid, pool_day date, pool_round_started_at timestamptz,
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id)
);
CREATE TABLE runtime_due (
 tenant_id uuid NOT NULL, mailbox_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('poll','pool','dispatch')),
 due_at timestamptz NOT NULL, next_check_at timestamptz NOT NULL, last_served_at timestamptz,
 job_id uuid REFERENCES send_job(id), service_seq bigint NOT NULL DEFAULT 0, state text NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','claimed','blocked')),
 owner_id uuid, lease_until timestamptz, generation bigint NOT NULL DEFAULT 0,
 failure_count integer NOT NULL DEFAULT 0 CHECK(failure_count BETWEEN 0 AND 5),
 reason text NOT NULL DEFAULT 'ready' CHECK(reason IN ('ready','waiting_peer','waiting_budget','waiting_capacity','waiting_pacing','transport_busy','provider_backoff','authority_denied','rescan_incomplete','cleanup_blocked','db_unavailable')),
 PRIMARY KEY(mailbox_id,kind), FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id),
 CHECK((state='claimed' AND owner_id IS NOT NULL AND lease_until IS NOT NULL) OR (state<>'claimed' AND owner_id IS NULL AND lease_until IS NULL))
);
CREATE INDEX runtime_due_ready ON runtime_due(kind,next_check_at,service_seq) WHERE state='ready';
INSERT INTO schema_migration(version) VALUES(15);
