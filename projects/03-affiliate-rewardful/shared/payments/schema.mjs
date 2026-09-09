export const paymentMigration = `
CREATE TABLE IF NOT EXISTS checkout_orders (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), shop_id text NOT NULL, test_mode boolean NOT NULL,
 command_key text NOT NULL, input_hash text NOT NULL, input jsonb NOT NULL, policy_id uuid NOT NULL,
 created_at timestamptz NOT NULL, provider_id text, confirmation_url text, status text NOT NULL DEFAULT 'created',
 UNIQUE(tenant_id,command_key), UNIQUE(shop_id,provider_id)
);
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy' CHECK (source IN ('legacy','connector'));
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS attribution jsonb;
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS return_url text;
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS external boolean NOT NULL DEFAULT false;
`;
