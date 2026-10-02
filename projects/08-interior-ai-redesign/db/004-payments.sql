CREATE TABLE partner (
 id uuid PRIMARY KEY, account_id uuid REFERENCES account(id), code text NOT NULL UNIQUE
 CHECK(code ~ '^[A-Za-z0-9_-]{8,128}$'), active boolean NOT NULL DEFAULT false
);
CREATE TABLE attribution (
 account_id uuid PRIMARY KEY REFERENCES account(id), partner_id uuid NOT NULL REFERENCES partner(id),
 source text NOT NULL CHECK(source IN ('code','cookie')), cookie_consent_at timestamptz, expires_at timestamptz,
 CHECK(source='code' OR (cookie_consent_at IS NOT NULL AND expires_at IS NOT NULL))
);
CREATE TABLE payment_intent (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account(id), idempotency_key text NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), package text NOT NULL CHECK(package='ROOM20'),
 amount_minor integer NOT NULL CHECK(amount_minor=90000), currency text NOT NULL CHECK(currency='RUB'),
 status text NOT NULL DEFAULT 'created' CHECK(status IN ('created','pending','succeeded','canceled','review')),
 provider_mode text NOT NULL CHECK(provider_mode IN ('live','fixture')), merchant_id text NOT NULL,
 provider_id text UNIQUE, provider_key uuid NOT NULL UNIQUE, provider_body text NOT NULL,
 partner_id uuid REFERENCES partner(id), confirmation_url text, created_at timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, lease_token uuid, attempts integer NOT NULL DEFAULT 0,
 UNIQUE(account_id,idempotency_key)
);
ALTER TABLE account ADD FOREIGN KEY(first_paid_payment_id) REFERENCES payment_intent(id);
CREATE TABLE provider_event (
 object_kind text NOT NULL CHECK(object_kind IN ('payment','refund')), provider_object_id text NOT NULL,
 event_type text NOT NULL, verified_state_sha text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(object_kind,provider_object_id,event_type)
);
CREATE TABLE verified_refund (
 provider_refund_id text PRIMARY KEY, payment_intent_id uuid NOT NULL REFERENCES payment_intent(id),
 provider_payment_id text NOT NULL, amount_minor integer NOT NULL CHECK(amount_minor>0 AND amount_minor<=90000),
 currency text NOT NULL CHECK(currency='RUB'), verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE first_conversion (
 account_id uuid PRIMARY KEY REFERENCES account(id), payment_intent_id uuid NOT NULL UNIQUE REFERENCES payment_intent(id),
 partner_id uuid NOT NULL REFERENCES partner(id), amount_minor integer NOT NULL CHECK(amount_minor=90000),
 currency text NOT NULL CHECK(currency='RUB'), valid boolean NOT NULL DEFAULT true
);
CREATE TABLE event (
 id uuid PRIMARY KEY, account_id uuid REFERENCES account(id), type text NOT NULL, reference uuid NOT NULL,
 dedupe_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_fixture_object (
 kind text NOT NULL CHECK(kind IN ('payment','refund')), id text NOT NULL, body jsonb NOT NULL,
 provider_key uuid UNIQUE, PRIMARY KEY(kind,id)
);
CREATE FUNCTION protect_payment_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.account_id,NEW.idempotency_key,NEW.request_hash,NEW.package,NEW.amount_minor,NEW.currency,
 NEW.provider_mode,NEW.merchant_id,NEW.provider_key,NEW.provider_body,NEW.partner_id,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.account_id,OLD.idempotency_key,OLD.request_hash,OLD.package,OLD.amount_minor,OLD.currency,
 OLD.provider_mode,OLD.merchant_id,OLD.provider_key,OLD.provider_body,OLD.partner_id,OLD.created_at)
 OR (OLD.provider_id IS NOT NULL AND NEW.provider_id IS DISTINCT FROM OLD.provider_id)
 OR (OLD.first_attempt_at IS NOT NULL AND NEW.first_attempt_at IS DISTINCT FROM OLD.first_attempt_at)
 OR (OLD.status='review' AND NEW.status<>'review')
 OR (OLD.status='succeeded' AND NEW.status NOT IN ('succeeded','review')) THEN
 RAISE EXCEPTION 'immutable payment binding'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER payment_binding BEFORE UPDATE ON payment_intent FOR EACH ROW EXECUTE FUNCTION protect_payment_binding();
CREATE FUNCTION protect_billing_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.billing_hold AND NOT NEW.billing_hold) OR
 (OLD.first_paid_payment_id IS NOT NULL AND NEW.first_paid_payment_id IS DISTINCT FROM OLD.first_paid_payment_id)
 THEN RAISE EXCEPTION 'monotonic billing state'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER billing_state BEFORE UPDATE ON account FOR EACH ROW EXECUTE FUNCTION protect_billing_state();
