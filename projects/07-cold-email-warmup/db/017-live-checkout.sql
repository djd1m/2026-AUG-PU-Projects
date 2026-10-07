ALTER TABLE live_billing_intent
 ADD COLUMN create_request jsonb,
 ADD COLUMN first_create_attempt_at timestamptz,
 ADD COLUMN confirmation_url text CHECK(confirmation_url IS NULL OR length(confirmation_url)<=2048),
 ADD CONSTRAINT live_create_request_object CHECK(create_request IS NULL OR (jsonb_typeof(create_request)='object' AND first_create_attempt_at IS NOT NULL));
CREATE OR REPLACE FUNCTION n7_immutable_live_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['payment_id','state','create_request','first_create_attempt_at','confirmation_url']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['payment_id','state','create_request','first_create_attempt_at','confirmation_url'])
 OR (OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id)
 OR (OLD.state IN ('canceled','declined','refunded') AND NEW.state IS DISTINCT FROM OLD.state)
 OR (OLD.state='succeeded' AND NEW.state='pending')
 OR (OLD.first_create_attempt_at IS NOT NULL AND (NEW.first_create_attempt_at IS DISTINCT FROM OLD.first_create_attempt_at OR NEW.create_request IS DISTINCT FROM OLD.create_request))
 OR (OLD.create_request IS NOT NULL AND NEW.create_request IS DISTINCT FROM OLD.create_request)
 OR (OLD.confirmation_url IS NOT NULL AND NEW.confirmation_url IS DISTINCT FROM OLD.confirmation_url)
 OR (NEW.confirmation_url IS NOT NULL AND NEW.payment_id IS NULL)
 THEN RAISE EXCEPTION 'immutable live intent'; END IF;
 RETURN NEW;
END $$;
INSERT INTO schema_migration(version) VALUES(17);
