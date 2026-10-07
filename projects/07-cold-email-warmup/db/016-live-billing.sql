-- Parallel ledger preserves TEST prices, provider FKs and TEST-only conversions.
CREATE TABLE live_billing_intent (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenant(id), client_key text NOT NULL,
 provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 100), merchant text NOT NULL CHECK(length(merchant) BETWEEN 1 AND 100),
 mode text NOT NULL CHECK(mode='live'), plan text NOT NULL CHECK(plan='team'),
 amount_minor integer NOT NULL CHECK(amount_minor>0), currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 duration_days integer NOT NULL CHECK(duration_days BETWEEN 1 AND 366),
 payment_id text CHECK(length(payment_id) BETWEEN 1 AND 200),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','succeeded','canceled','declined','refunded')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,client_key), UNIQUE(provider,merchant,mode,payment_id), UNIQUE(id,tenant_id)
);
CREATE FUNCTION n7_immutable_live_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['payment_id','state']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['payment_id','state'])
 OR (OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id)
 OR (OLD.state IN ('canceled','declined','refunded') AND NEW.state IS DISTINCT FROM OLD.state)
 OR (OLD.state='succeeded' AND NEW.state='pending') THEN RAISE EXCEPTION 'immutable live intent'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER live_intent_immutable BEFORE UPDATE ON live_billing_intent FOR EACH ROW EXECUTE FUNCTION n7_immutable_live_intent();
CREATE TABLE live_billing_observation (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 intent_id uuid NOT NULL REFERENCES live_billing_intent(id), kind text NOT NULL CHECK(kind IN ('payment','refund')),
 snapshot jsonb NOT NULL, observed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- sequence orders local persistence only, never remote chronology.
CREATE TABLE live_billing_refund (
 provider text NOT NULL, merchant text NOT NULL, refund_id text NOT NULL,
 intent_id uuid NOT NULL REFERENCES live_billing_intent(id), snapshot jsonb NOT NULL,
 PRIMARY KEY(provider,merchant,refund_id)
);
CREATE TABLE live_billing_entitlement (
 intent_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, paid_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 FOREIGN KEY(intent_id,tenant_id) REFERENCES live_billing_intent(id,tenant_id), CHECK(expires_at>paid_at)
);
CREATE INDEX live_entitlement_current ON live_billing_entitlement(tenant_id,expires_at);
INSERT INTO schema_migration(version) VALUES(16);
