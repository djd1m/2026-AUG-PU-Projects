ALTER TABLE account ADD COLUMN email_verified_at timestamptz;
CREATE TABLE support_email_token (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), email text NOT NULL,
 digest text NOT NULL UNIQUE, issuing_session_hash text, expires_at timestamptz NOT NULL, used_at timestamptz,
 delivery_state text NOT NULL DEFAULT 'pending' CHECK(delivery_state IN ('pending','accepted','failed','unknown')),
 CHECK ((purpose='verify')=(issuing_session_hash IS NOT NULL))
);
CREATE UNIQUE INDEX support_email_pending ON support_email_token(account_id,purpose) WHERE used_at IS NULL;
CREATE INDEX support_email_expiry ON support_email_token(expires_at,id);
CREATE TABLE support_mail_admission (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), email_hash text NOT NULL, ip_hash text NOT NULL
);
CREATE INDEX support_admission_email ON support_mail_admission(purpose,email_hash,created_at);
CREATE INDEX support_admission_ip ON support_mail_admission(ip_hash,created_at);
CREATE TABLE support_operator (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL UNIQUE REFERENCES account(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), revoked_at timestamptz
);
CREATE TABLE support_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor text NOT NULL, target uuid, action text NOT NULL CHECK(action IN ('grant','revoke','list','search','card')),
 reason text
);
