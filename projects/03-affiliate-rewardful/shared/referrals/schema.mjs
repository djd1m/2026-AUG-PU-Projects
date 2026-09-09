export const referralMigration = `
CREATE TABLE IF NOT EXISTS referral_programs (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id), landing_url text NOT NULL,
 return_url text NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS referral_credentials (
 token_hash text PRIMARY KEY, tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id),
 account_id uuid NOT NULL REFERENCES accounts(id), version integer NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS referral_visits (
 id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, tenant_id uuid NOT NULL REFERENCES tenants(id),
 beneficiary_id uuid NOT NULL, policy_id uuid NOT NULL,
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS referral_visits_scope ON referral_visits(tenant_id,beneficiary_id);
CREATE TABLE IF NOT EXISTS referral_customers (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
 external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 160), email_hash text NOT NULL,
 beneficiary_id uuid, channel text NOT NULL CHECK (channel IN ('link','promo','none')),
 attributed_at timestamptz, registered_at timestamptz NOT NULL, source_id uuid,
 UNIQUE(tenant_id,external_id),
 CHECK ((channel='none' AND beneficiary_id IS NULL AND attributed_at IS NULL) OR
        (channel IN ('link','promo') AND beneficiary_id IS NOT NULL AND attributed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS referral_customers_scope ON referral_customers(tenant_id,beneficiary_id);
`;
