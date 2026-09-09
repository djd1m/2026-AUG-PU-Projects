export const accessMigration = `
ALTER TABLE accounts ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS authenticated_at timestamptz;
CREATE TABLE IF NOT EXISTS email_flows (
 email text NOT NULL, purpose text NOT NULL CHECK(purpose IN ('register','reset','contact')),
 token_hash text UNIQUE NOT NULL, account_id uuid REFERENCES accounts(id), version integer,
 name text, issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz,
 PRIMARY KEY(email,purpose)
);
CREATE INDEX IF NOT EXISTS email_flows_expiry ON email_flows(expires_at);
CREATE TABLE IF NOT EXISTS access_limits (
 key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL, next_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS access_limits_expiry ON access_limits(expires_at);
CREATE TABLE IF NOT EXISTS oauth_flows (
 state_hash text PRIMARY KEY, browser_hash text NOT NULL, verifier text NOT NULL,
 origin text NOT NULL, intent text NOT NULL CHECK(intent IN ('login','link')),
 account_id uuid REFERENCES accounts(id), version integer, session_hash text,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_flows_expiry ON oauth_flows(expires_at);
CREATE TABLE IF NOT EXISTS sso_identities (
 provider text NOT NULL CHECK(provider='yandex'), external_id text NOT NULL,
 account_id uuid NOT NULL REFERENCES accounts(id), created_at timestamptz NOT NULL,
 PRIMARY KEY(provider,external_id), UNIQUE(account_id,provider)
);
CREATE TABLE IF NOT EXISTS access_policy (
 id integer PRIMARY KEY CHECK(id=1), verification_required boolean NOT NULL DEFAULT false
);
INSERT INTO access_policy(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
`;
