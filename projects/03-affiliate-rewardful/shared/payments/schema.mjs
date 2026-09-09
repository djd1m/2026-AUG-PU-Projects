export const paymentMigration = `
CREATE TABLE IF NOT EXISTS checkout_orders (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), shop_id text NOT NULL, test_mode boolean NOT NULL,
 command_key text NOT NULL, input_hash text NOT NULL, input jsonb NOT NULL, policy_id uuid NOT NULL,
 created_at timestamptz NOT NULL, provider_id text, confirmation_url text, status text NOT NULL DEFAULT 'created',
 UNIQUE(tenant_id,command_key), UNIQUE(shop_id,provider_id)
);
`;
