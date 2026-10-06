CREATE TABLE partner_code (
 tenant_id uuid PRIMARY KEY REFERENCES tenant(id), code text NOT NULL UNIQUE CHECK(code ~ '^[A-Za-z0-9_-]{16,64}$'), active boolean NOT NULL DEFAULT true
);
CREATE TABLE billing_intent (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenant(id), client_key text NOT NULL,
 request_payload jsonb NOT NULL, plan text NOT NULL CHECK(plan='team'), amount_minor integer NOT NULL CHECK(amount_minor=100), currency text NOT NULL CHECK(currency='RUB'), duration_days integer NOT NULL CHECK(duration_days=30),
 partner_tenant uuid REFERENCES partner_code(tenant_id), partner_code text, attribution_reason text NOT NULL,
 payment_id uuid, state text NOT NULL DEFAULT 'pending', applied_version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(tenant_id,client_key),
 CHECK((partner_tenant IS NULL)=(partner_code IS NULL)), CHECK(partner_tenant IS DISTINCT FROM tenant_id)
);
CREATE TABLE local_provider_payment (
 id uuid PRIMARY KEY, provider_key uuid NOT NULL UNIQUE, amount_minor integer NOT NULL, currency text NOT NULL, metadata jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','canceled','revoked','expired')), paid_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK(version>0), available boolean NOT NULL DEFAULT true
);
ALTER TABLE billing_intent ADD FOREIGN KEY(payment_id) REFERENCES local_provider_payment(id);
CREATE TABLE billing_entitlement (
 intent_id uuid PRIMARY KEY REFERENCES billing_intent(id), tenant_id uuid NOT NULL REFERENCES tenant(id), paid_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CHECK(expires_at=paid_at+interval '30 days')
);
CREATE INDEX billing_entitlement_current ON billing_entitlement(tenant_id,expires_at);
CREATE TABLE partner_conversion (
 buyer_tenant uuid PRIMARY KEY REFERENCES tenant(id), intent_id uuid NOT NULL UNIQUE REFERENCES billing_intent(id), partner_tenant uuid NOT NULL REFERENCES partner_code(tenant_id), code text NOT NULL, mode text NOT NULL DEFAULT 'TEST' CHECK(mode='TEST'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), CHECK(buyer_tenant<>partner_tenant)
);
CREATE FUNCTION n7_immutable_billing_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['payment_id','state','applied_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['payment_id','state','applied_version']) OR (OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id) THEN RAISE EXCEPTION 'immutable intent'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER billing_intent_immutable BEFORE UPDATE ON billing_intent FOR EACH ROW EXECUTE FUNCTION n7_immutable_billing_intent();
INSERT INTO schema_migration(version) VALUES(10);
