CREATE TABLE IF NOT EXISTS schema_migration (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE tenant (id uuid PRIMARY KEY, state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','inactive')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE account (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenant(id), email text NOT NULL UNIQUE, password_hash text NOT NULL, state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','inactive')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE session (id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account(id), token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_bucket (bucket_key text NOT NULL, window_start timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts > 0), PRIMARY KEY(bucket_key, window_start));
-- F01 read fixture only. No provider, credential, transport or consent implementation.
CREATE TABLE mailbox (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenant(id), label text NOT NULL, state text NOT NULL DEFAULT 'unconnected' CHECK(state = 'unconnected'), created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migration(version) VALUES (1);
