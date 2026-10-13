ALTER TABLE mailbox DROP CONSTRAINT mailbox_state_check;
ALTER TABLE mailbox ADD CONSTRAINT mailbox_state_check CHECK(state IN ('unconnected','configured','verified_test','paused','quarantined'));
ALTER TABLE mailbox ADD COLUMN credential_envelope jsonb;
ALTER TABLE mailbox ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE mailbox ADD COLUMN daily_limit integer NOT NULL DEFAULT 10 CHECK(daily_limit BETWEEN 1 AND 30);
ALTER TABLE mailbox ADD COLUMN provider_limit integer NOT NULL DEFAULT 30 CHECK(provider_limit BETWEEN 1 AND 30);
ALTER TABLE mailbox ADD CONSTRAINT mailbox_tenant_identity UNIQUE(tenant_id,id);
ALTER TABLE account ADD CONSTRAINT account_tenant_identity UNIQUE(tenant_id,id);
CREATE TABLE campaign (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenant(id), content text NOT NULL,
  content_version integer NOT NULL DEFAULT 1 CHECK(content_version>0), recipients jsonb NOT NULL,
  recipient_fingerprint char(64) NOT NULL, state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','paused')),
  UNIQUE(tenant_id,id)
);
CREATE TABLE consent (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, mailbox_id uuid NOT NULL, actor_id uuid NOT NULL,
  scope text NOT NULL CHECK(scope IN ('pool','campaign')), scope_version integer NOT NULL CHECK(scope_version>0),
  campaign_id uuid, recipient_fingerprint char(64), disclosure jsonb,
  granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES account(tenant_id,id),
  FOREIGN KEY(tenant_id,campaign_id) REFERENCES campaign(tenant_id,id),
  CHECK((scope='pool' AND campaign_id IS NULL AND disclosure IS NOT NULL AND recipient_fingerprint IS NULL) OR
        (scope='campaign' AND campaign_id IS NOT NULL AND recipient_fingerprint IS NOT NULL AND disclosure IS NULL))
);
CREATE UNIQUE INDEX consent_current_pool ON consent(mailbox_id) WHERE scope='pool' AND revoked_at IS NULL;
CREATE UNIQUE INDEX consent_current_campaign ON consent(mailbox_id,campaign_id) WHERE scope='campaign' AND revoked_at IS NULL;
CREATE TABLE pool_member (
  tenant_id uuid NOT NULL, mailbox_id uuid PRIMARY KEY, consent_id uuid NOT NULL REFERENCES consent(id),
  FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id)
);
CREATE TABLE send_job (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, mailbox_id uuid NOT NULL, recipient_mailbox_id uuid REFERENCES mailbox(id),
  scope text NOT NULL CHECK(scope IN ('pool','campaign')), campaign_id uuid,
  state text NOT NULL CHECK(state IN ('queued','claimed','submitting','cancelled','submitted','unknown')),
  FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id),
  FOREIGN KEY(tenant_id,campaign_id) REFERENCES campaign(tenant_id,id),
  CHECK((scope='pool' AND campaign_id IS NULL) OR (scope='campaign' AND campaign_id IS NOT NULL))
);
INSERT INTO schema_migration(version) VALUES(2);
