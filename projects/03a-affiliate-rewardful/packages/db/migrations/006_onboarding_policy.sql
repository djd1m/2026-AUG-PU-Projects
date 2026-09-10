CREATE FUNCTION n3a.onboarding_save_policy(s bytea,p uuid,j jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE pr n3a.programs%ROWTYPE; u uuid; t timestamptz; latest n3a.policy_versions%ROWTYPE; effective timestamptz; pid uuid; current_value jsonb;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 pr:=n3a.lock_program(p); u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t); PERFORM n3a.authority(p,u,'configure',true);
 SELECT * INTO latest FROM n3a.policy_versions WHERE program_id=p ORDER BY version DESC LIMIT 1;
 IF j->'acknowledged' IS DISTINCT FROM 'true'::jsonb OR j->>'effective_mode' IS NULL OR j->>'effective_mode' NOT IN ('now','future')
 OR j->>'timezone' IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=j->>'timezone')
 OR j->>'terms_text' IS NULL OR j->>'expected_version' IS NULL THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 IF (j->>'expected_version')::integer<>coalesce(latest.version,0) THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 IF pr.calendar_locked_at IS NOT NULL AND pr.timezone IS DISTINCT FROM j->>'timezone' THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 effective:=CASE WHEN j->>'effective_mode'='now' THEN t ELSE (j->>'effective_at')::timestamptz END;
 IF effective IS NULL OR (j->>'effective_mode'='future' AND effective<=t) OR effective<=latest.effective_at THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 INSERT INTO n3a.policy_versions(tenant_id,program_id,created_at,version,effective_at,rate_bp,attribution_days,conflict_rule,recurring_mode,commission_duration,currency,timezone,terms_text,terms_hash)
 VALUES(pr.tenant_id,p,t,coalesce(latest.version,0)+1,effective,(j->>'rate_bp')::integer,(j->>'attribution_days')::integer,
 j->>'conflict_rule',j->>'recurring_mode',j->>'commission_duration',j->>'currency',j->>'timezone',j->>'terms_text',sha256(convert_to(j->>'terms_text','UTF8'))) RETURNING id INTO pid;
 current_value:=n3a.policy_json(p,t);
 UPDATE n3a.programs SET current_policy_id=(current_value->>'id')::uuid,timezone=CASE WHEN calendar_locked_at IS NULL THEN current_value->>'timezone' ELSE timezone END WHERE id=p;
 PERFORM n3a.audit(p,u,'policy',pid,t);
 RETURN jsonb_build_object('policy_id',pid,'version',coalesce(latest.version,0)+1,'program_status',pr.status);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_save_policy(bytea,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_save_policy(bytea,uuid,jsonb) TO n3a_app;
CREATE FUNCTION n3a.onboarding_activate(s bytea,p uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE u uuid; t timestamptz;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 PERFORM n3a.lock_program(p); u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t);
 PERFORM n3a.authority(p,u,'configure',true); PERFORM n3a.onboarding_fail('integration_not_ready'); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_activate(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_activate(bytea,uuid) TO n3a_app;
-- Invariants remain effective even when privileged fixture code constructs tuples.
CREATE FUNCTION n3a.check_membership_tuple() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ DECLARE g n3a.enrollment_grants%ROWTYPE; owner uuid;
BEGIN
 SELECT * INTO g FROM n3a.enrollment_grants WHERE id=NEW.source_grant_id;
 SELECT owner_id INTO owner FROM n3a.programs WHERE id=NEW.program_id;
 IF g.scopes IS DISTINCT FROM NEW.scopes OR g.partner_id IS DISTINCT FROM NEW.partner_id
 OR (NEW.role='owner' AND owner IS DISTINCT FROM NEW.user_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='membership_tuple'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION n3a.check_membership_tuple() FROM PUBLIC;
CREATE TRIGGER membership_tuple BEFORE INSERT OR UPDATE ON n3a.memberships FOR EACH ROW EXECUTE FUNCTION n3a.check_membership_tuple();
CREATE FUNCTION n3a.preserve_consent() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ BEGIN
 IF OLD.accepted_at IS NOT NULL AND (NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.accepted_policy_id IS DISTINCT FROM OLD.accepted_policy_id OR NEW.user_id IS DISTINCT FROM OLD.user_id)
 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='immutable_consent'; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION n3a.preserve_consent() FROM PUBLIC;
CREATE TRIGGER preserve_consent BEFORE UPDATE ON n3a.partners FOR EACH ROW EXECUTE FUNCTION n3a.preserve_consent();
