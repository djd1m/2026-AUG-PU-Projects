CREATE TABLE installation_capacity (id integer PRIMARY KEY CHECK(id=1), active_limit integer NOT NULL CHECK(active_limit=30));
INSERT INTO installation_capacity VALUES(1,30);
CREATE INDEX mailbox_tenant_page ON mailbox(tenant_id,created_at,id);
CREATE TABLE capacity_lease (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, mailbox_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL CHECK(state IN ('active','waiting_capacity')), expires_at timestamptz,
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id),
 CHECK((state='active' AND expires_at IS NOT NULL) OR (state='waiting_capacity' AND expires_at IS NULL))
);
CREATE INDEX capacity_active ON capacity_lease(expires_at) WHERE state='active';
INSERT INTO schema_migration(version) VALUES(12);
