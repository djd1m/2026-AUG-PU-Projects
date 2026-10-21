CREATE FUNCTION guard_payment_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['remote_id','confirmation_url','state','paid_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['remote_id','confirmation_url','state','paid_at']) THEN RAISE EXCEPTION 'immutable payment intent'; END IF;
 IF OLD.remote_id IS NOT NULL AND NEW.remote_id IS DISTINCT FROM OLD.remote_id THEN RAISE EXCEPTION 'payment remote identity cannot change'; END IF;
 IF OLD.state='refund_hold' AND NEW.state!='refund_hold' THEN RAISE EXCEPTION 'refund hold is permanent for this order'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_intent_immutable BEFORE UPDATE ON payment_order FOR EACH ROW EXECUTE FUNCTION guard_payment_intent();
