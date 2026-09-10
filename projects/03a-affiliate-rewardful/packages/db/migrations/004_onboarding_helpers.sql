-- Internal helpers are deliberately not callable by n3a_app.
CREATE FUNCTION n3a.onboarding_fail(code text) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE=code; END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_fail(text) FROM PUBLIC;
CREATE FUNCTION n3a.lock_identity(h bytea, p uuid) RETURNS uuid LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$
DECLARE s n3a.sessions%ROWTYPE;
BEGIN
 SELECT * INTO s FROM n3a.sessions WHERE token_hash=h FOR SHARE;
 IF NOT FOUND THEN PERFORM n3a.onboarding_fail('unauthorized'); END IF;
 -- Lock users before memberships; program lock held by callers serializes same-program authority.
 PERFORM u.id FROM n3a.users u WHERE u.id=s.user_id OR u.id IN
 (SELECT m.user_id FROM n3a.memberships m WHERE m.program_id=p) ORDER BY u.id FOR SHARE;
 PERFORM m.id FROM n3a.memberships m WHERE m.program_id=p ORDER BY m.id FOR UPDATE;
 RETURN s.user_id;
END $$;
REVOKE ALL ON FUNCTION n3a.lock_identity(bytea,uuid) FROM PUBLIC;
CREATE FUNCTION n3a.check_identity(h bytea, t timestamptz) RETURNS uuid LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ DECLARE u uuid;
BEGIN
 SELECT s.user_id INTO u FROM n3a.sessions s JOIN n3a.users x ON x.id=s.user_id
 WHERE s.token_hash=h AND s.revoked_at IS NULL AND s.expires_at>t AND x.enabled;
 IF u IS NULL THEN PERFORM n3a.onboarding_fail('unauthorized'); END IF; RETURN u;
END $$;
REVOKE ALL ON FUNCTION n3a.check_identity(bytea,timestamptz) FROM PUBLIC;
CREATE FUNCTION n3a.authority(p uuid,u uuid,scope text,owner_only boolean) RETURNS n3a.memberships LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ DECLARE m n3a.memberships%ROWTYPE;
BEGIN
 SELECT x.* INTO m FROM n3a.memberships x JOIN n3a.programs g ON g.id=x.program_id
 LEFT JOIN n3a.partners a ON a.id=x.partner_id
 WHERE x.program_id=p AND x.user_id=u AND x.status='active' AND scope=ANY(x.scopes)
 AND (NOT owner_only OR x.role='owner') AND (x.role<>'owner' OR g.owner_id=u)
 AND (x.role<>'partner' OR (a.status='active' AND a.user_id=u))
 ORDER BY CASE x.role WHEN 'owner' THEN 0 WHEN 'operator' THEN 1 ELSE 2 END LIMIT 1;
 IF m.id IS NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF; RETURN m;
END $$;
REVOKE ALL ON FUNCTION n3a.authority(uuid,uuid,text,boolean) FROM PUBLIC;
CREATE FUNCTION n3a.lock_program(p uuid) RETURNS n3a.programs LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ DECLARE r n3a.programs%ROWTYPE;
BEGIN SELECT * INTO r FROM n3a.programs WHERE id=p FOR UPDATE;
 IF r.id IS NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF; RETURN r; END $$;
REVOKE ALL ON FUNCTION n3a.lock_program(uuid) FROM PUBLIC;
CREATE FUNCTION n3a.lock_grant(h bytea) RETURNS n3a.enrollment_grants LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ DECLARE g n3a.enrollment_grants%ROWTYPE; p uuid;
BEGIN
 SELECT program_id INTO p FROM n3a.enrollment_grants WHERE token_hash=h;
 IF p IS NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 PERFORM n3a.lock_program(p);
 SELECT * INTO g FROM n3a.enrollment_grants WHERE token_hash=h FOR UPDATE;
 RETURN g;
END $$;
REVOKE ALL ON FUNCTION n3a.lock_grant(bytea) FROM PUBLIC;
CREATE FUNCTION n3a.check_grant(g n3a.enrollment_grants,h bytea,u uuid,t timestamptz,bound boolean) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ DECLARE p n3a.programs%ROWTYPE; m n3a.memberships%ROWTYPE;
BEGIN
 SELECT * INTO p FROM n3a.programs WHERE id=g.program_id;
 IF g.id IS NULL OR g.invited_identity_hash IS DISTINCT FROM h OR g.revoked_at IS NOT NULL
 OR (g.consumed_at IS NULL AND g.expires_at<=t) OR (bound AND g.enrolled_user_id IS DISTINCT FROM u)
 OR (g.enrolled_user_id IS NOT NULL AND u IS NOT NULL AND g.enrolled_user_id<>u)
 OR NOT n3a.valid_scopes(g.role,g.scopes) THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 IF g.role='owner' THEN
 IF NOT EXISTS(SELECT 1 FROM n3a.bootstrap_receipts r WHERE r.owner_grant_id=g.id AND r.program_id=g.program_id)
 OR (p.owner_id IS NOT NULL AND p.owner_id IS DISTINCT FROM u) THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 ELSE
 SELECT * INTO m FROM n3a.memberships WHERE program_id=g.program_id AND user_id=g.issued_by AND role='owner' AND status='active';
 IF m.id IS NULL OR p.owner_id IS DISTINCT FROM g.issued_by OR NOT g.scopes<@m.scopes
 OR NOT EXISTS(SELECT 1 FROM n3a.users WHERE id=g.issued_by AND enabled) THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 END IF;
 IF g.consumed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM n3a.memberships replay_member LEFT JOIN n3a.partners a ON a.id=replay_member.partner_id
 WHERE replay_member.source_grant_id=g.id AND replay_member.user_id=u AND replay_member.status='active' AND replay_member.scopes=g.scopes
 AND (replay_member.role<>'partner' OR a.status='active')) THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
END $$;
REVOKE ALL ON FUNCTION n3a.check_grant(n3a.enrollment_grants,bytea,uuid,timestamptz,boolean) FROM PUBLIC;
CREATE FUNCTION n3a.policy_json(p uuid,t timestamptz) RETURNS jsonb LANGUAGE sql
SET search_path=pg_catalog,pg_temp AS $$ SELECT jsonb_build_object('id',id,'version',version,'terms_hash',encode(terms_hash,'hex'),
 'terms_text',terms_text,'effective_at',effective_at,'rate_bp',rate_bp,'attribution_days',attribution_days,'conflict_rule',conflict_rule,
 'recurring_mode',recurring_mode,'commission_duration',commission_duration,'currency',currency,'timezone',timezone)
 FROM n3a.policy_versions WHERE program_id=p AND effective_at<=t ORDER BY effective_at DESC LIMIT 1 $$;
REVOKE ALL ON FUNCTION n3a.policy_json(uuid,timestamptz) FROM PUBLIC;
CREATE FUNCTION n3a.grant_preview(g n3a.enrollment_grants,t timestamptz) RETURNS jsonb LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ DECLARE p n3a.programs%ROWTYPE; pol jsonb;
BEGIN SELECT * INTO p FROM n3a.programs WHERE id=g.program_id; pol:=n3a.policy_json(p.id,t);
 IF g.role='partner' AND pol IS NULL THEN PERFORM n3a.onboarding_fail('policy_unavailable'); END IF;
 RETURN jsonb_build_object('grant_id',g.id,'role',g.role,'scopes',g.scopes,'program_id',p.id,'program_name',p.name,'program_status',p.status,'integration_status','not_ready','policy',pol);
END $$;
REVOKE ALL ON FUNCTION n3a.grant_preview(n3a.enrollment_grants,timestamptz) FROM PUBLIC;
CREATE FUNCTION n3a.audit(p uuid,u uuid,a text,target uuid,t timestamptz) RETURNS void LANGUAGE sql
SET search_path=pg_catalog,pg_temp AS $$ INSERT INTO n3a.audit_events(program_id,actor_id,action,target_id,created_at) VALUES(p,u,a,target,t) $$;
REVOKE ALL ON FUNCTION n3a.audit(uuid,uuid,text,uuid,timestamptz) FROM PUBLIC;
CREATE FUNCTION n3a.append_fact(p uuid,k text,s uuid,status_value text,expiry timestamptz,policy uuid,u uuid,t timestamptz) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$ DECLARE prev n3a.eligibility_facts%ROWTYPE; tenant uuid; fact_id uuid:=gen_random_uuid(); payload text;
BEGIN
 SELECT * INTO prev FROM n3a.eligibility_facts WHERE subject_kind=k AND subject_id=s ORDER BY version DESC LIMIT 1;
 IF prev.valid_from>t THEN PERFORM n3a.onboarding_fail('unavailable'); END IF;
 SELECT tenant_id INTO tenant FROM n3a.programs WHERE id=p;
 payload:=jsonb_build_array('n3a:eligibility:v1',fact_id,tenant,p,k,s,coalesce(prev.version,0)+1,
 to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),status_value,
 to_char(expiry AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),policy,u)::text;
 INSERT INTO n3a.eligibility_facts(id,tenant_id,program_id,subject_kind,subject_id,partner_id,asset_id,version,valid_from,status,expires_at,consent_policy_id,actor_id,evidence)
 VALUES(fact_id,tenant,p,k,s,CASE WHEN k='partner' THEN s END,CASE WHEN k='asset' THEN s END,coalesce(prev.version,0)+1,t,status_value,expiry,policy,u,
 jsonb_build_object('reference','server:eligibility:v1:'||fact_id,'sha256',encode(sha256(convert_to(payload,'UTF8')),'hex')));
END $$;
REVOKE ALL ON FUNCTION n3a.append_fact(uuid,text,uuid,text,timestamptz,uuid,uuid,timestamptz) FROM PUBLIC;
