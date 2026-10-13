-- Historical F03a ownerless rows stay ineligible; all new registry entries require owners.
UPDATE partner SET active=false WHERE account_id IS NULL;
ALTER TABLE partner ADD CONSTRAINT partner_owner_required CHECK(account_id IS NOT NULL) NOT VALID;
CREATE FUNCTION protect_partner_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.account_id,NEW.code) IS DISTINCT FROM ROW(OLD.id,OLD.account_id,OLD.code)
 THEN RAISE EXCEPTION 'immutable partner binding'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER partner_binding BEFORE UPDATE ON partner FOR EACH ROW EXECUTE FUNCTION protect_partner_binding();
CREATE TABLE tracking_consent (
 account_id uuid PRIMARY KEY REFERENCES account(id), opted_in boolean NOT NULL DEFAULT false,
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE attribution ADD COLUMN cookie_hash text CHECK(cookie_hash ~ '^[a-f0-9]{64}$');
-- Pre-F03b cookie preferences had no protected proof and cannot be used.
DELETE FROM attribution WHERE source='cookie';
ALTER TABLE attribution ADD CONSTRAINT attribution_cookie_proof CHECK(source='code' OR cookie_hash IS NOT NULL);
