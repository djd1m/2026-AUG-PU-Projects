CREATE TABLE account (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  password_hash text NOT NULL,
  trial_granted boolean NOT NULL DEFAULT false,
  billing_hold boolean NOT NULL DEFAULT false,
  badge_free_entitlement boolean NOT NULL DEFAULT false,
  first_paid_payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE session (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  account_id uuid NOT NULL REFERENCES account(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_account ON session(account_id);
CREATE TABLE credit_ledger (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES account(id),
  delta integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('trial','purchase','reserve','release')),
  reference uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind,reference),
  CHECK ((kind='trial' AND delta=1 AND reference=account_id) OR
    (kind='purchase' AND delta>0) OR (kind='reserve' AND delta=-1) OR (kind='release' AND delta=1))
);
CREATE UNIQUE INDEX one_trial_per_account ON credit_ledger(account_id) WHERE kind='trial';
CREATE INDEX credit_ledger_account ON credit_ledger(account_id);
CREATE TABLE upload (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES account(id),
  private_key uuid NOT NULL UNIQUE CHECK (private_key=id),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  width integer NOT NULL CHECK (width>0),
  height integer NOT NULL CHECK (height>0 AND width::bigint*height<=20000000),
  mime text NOT NULL CHECK (mime='image/webp'),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX upload_owner ON upload(account_id,created_at DESC) WHERE deleted_at IS NULL;
