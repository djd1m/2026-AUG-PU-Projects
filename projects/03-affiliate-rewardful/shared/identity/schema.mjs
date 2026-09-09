export const identityMigration = `
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'fixture' CHECK (mode IN ('fixture','real'));
CREATE TABLE IF NOT EXISTS accounts (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS memberships (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), tenant_id uuid NOT NULL REFERENCES tenants(id),
 actor_id uuid NOT NULL, UNIQUE(account_id,tenant_id), UNIQUE(tenant_id,actor_id)
);
CREATE TABLE IF NOT EXISTS user_sessions (
 token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), version integer NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS invitations (
 token_hash text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
 role text NOT NULL CHECK(role IN ('partner','customer')), expires_at timestamptz NOT NULL, accepted_by uuid REFERENCES accounts(id)
);
CREATE TABLE IF NOT EXISTS agent_credentials (
 token_hash text PRIMARY KEY, membership_id uuid NOT NULL REFERENCES memberships(id), version integer NOT NULL,
 grant_id uuid NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS auth_attempts (
 key text PRIMARY KEY, count integer NOT NULL, until_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_expiry ON auth_attempts(until_at);
`;
