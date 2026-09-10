CREATE FUNCTION n3a.partner_assets_json(p uuid,a uuid) RETURNS jsonb LANGUAGE sql
SET search_path=pg_catalog,pg_temp AS $$ SELECT jsonb_build_object('partner_id',r.id,'program_id',r.program_id,'program_status',g.status,'integration_status','not_ready',
 'partner_status',r.status,'accepted_policy_id',r.accepted_policy_id,'accepted_at',r.accepted_at,
 'assets',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'public_code',x.public_code,'status',x.status,'expires_at',x.expires_at,'cohort',x.cohort,
 'future_path',CASE WHEN x.kind='link' THEN '/r/'||x.public_code ELSE NULL END) ORDER BY x.kind) FROM n3a.partner_assets x WHERE x.program_id=p AND x.partner_id=a),'[]'::jsonb))
 FROM n3a.partners r JOIN n3a.programs g ON g.id=r.program_id WHERE r.id=a AND r.program_id=p AND r.accepted_at IS NOT NULL $$;
REVOKE ALL ON FUNCTION n3a.partner_assets_json(uuid,uuid) FROM PUBLIC;
CREATE FUNCTION n3a.onboarding_accept_partner(s bytea,h bytea,j jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE g n3a.enrollment_grants%ROWTYPE; a n3a.partners%ROWTYPE; inv n3a.invitations%ROWTYPE;
 u uuid; identity bytea; t timestamptz; pol jsonb; mid uuid; aid uuid; kind_value text; code text; attempt integer;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 g:=n3a.lock_grant(h);
 IF g.role<>'partner' THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 SELECT * INTO inv FROM n3a.invitations WHERE enrollment_grant_id=g.id AND program_id=g.program_id FOR UPDATE;
 SELECT * INTO a FROM n3a.partners WHERE id=g.partner_id AND program_id=g.program_id FOR UPDATE;
 u:=n3a.lock_identity(s,g.program_id); t:=clock_timestamp(); u:=n3a.check_identity(s,t);
 SELECT identity_hash INTO identity FROM n3a.users WHERE id=u; PERFORM n3a.check_grant(g,identity,u,t,true);
 IF inv.id IS NULL OR a.id IS NULL OR inv.token_hash IS DISTINCT FROM g.token_hash OR inv.partner_id IS DISTINCT FROM a.id THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 IF g.consumed_at IS NOT NULL THEN
 IF a.status<>'active' OR a.user_id<>u OR inv.consumed_at IS NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 SELECT id INTO mid FROM n3a.memberships WHERE source_grant_id=g.id AND user_id=u AND status='active';
 RETURN n3a.partner_assets_json(g.program_id,a.id)||jsonb_build_object('membership_id',mid);
 END IF;
 IF inv.consumed_at IS NOT NULL OR inv.expires_at<=t OR a.status<>'invited' THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 pol:=n3a.policy_json(g.program_id,t);
 IF pol IS NULL THEN PERFORM n3a.onboarding_fail('policy_unavailable'); END IF;
 IF j->'accepted' IS DISTINCT FROM 'true'::jsonb OR j->>'policy_id' IS DISTINCT FROM pol->>'id' OR j->>'terms_hash' IS DISTINCT FROM pol->>'terms_hash' THEN PERFORM n3a.onboarding_fail('terms_changed'); END IF;
 UPDATE n3a.partners SET user_id=u,status='active',accepted_policy_id=(pol->>'id')::uuid,accepted_at=t WHERE id=a.id;
 INSERT INTO n3a.memberships(tenant_id,program_id,user_id,created_at,role,scopes,partner_id,source_grant_id,status)
 VALUES(g.tenant_id,g.program_id,u,t,'partner',ARRAY['read'],a.id,g.id,'active') RETURNING id INTO mid;
 PERFORM n3a.append_fact(g.program_id,'partner',a.id,'active',NULL,(pol->>'id')::uuid,u,t);
 FOREACH kind_value IN ARRAY ARRAY['link','promo'] LOOP
 FOR attempt IN 1..3 LOOP
 BEGIN
 -- UUID randomness supplies sixteen random bytes; public codes are identifiers, never credentials.
 code:=translate(rtrim(encode(uuid_send(gen_random_uuid()),'base64'),'='),'+/','-_');
 INSERT INTO n3a.partner_assets(tenant_id,program_id,partner_id,created_at,kind,public_code,status,cohort)
 VALUES(g.tenant_id,g.program_id,a.id,t,kind_value,code,'active',g.id::text) RETURNING id INTO aid;
 EXIT;
 EXCEPTION WHEN unique_violation THEN IF attempt=3 THEN RAISE; END IF;
 END;
 END LOOP;
 PERFORM n3a.append_fact(g.program_id,'asset',aid,'active',NULL,(pol->>'id')::uuid,u,t);
 END LOOP;
 UPDATE n3a.enrollment_grants SET consumed_at=t WHERE id=g.id;
 UPDATE n3a.invitations SET consumed_at=t WHERE id=inv.id;
 PERFORM n3a.audit(g.program_id,u,'accept',g.id,t);
 RETURN n3a.partner_assets_json(g.program_id,a.id)||jsonb_build_object('membership_id',mid);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_accept_partner(bytea,bytea,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_accept_partner(bytea,bytea,jsonb) TO n3a_app;
CREATE FUNCTION n3a.onboarding_partner_status(s bytea,p uuid,a uuid,j jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE r n3a.partners%ROWTYPE; u uuid; t timestamptz;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 PERFORM n3a.lock_program(p); SELECT * INTO r FROM n3a.partners WHERE id=a AND program_id=p FOR UPDATE;
 u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t); PERFORM n3a.authority(p,u,'invite',true);
 IF r.id IS NULL OR r.accepted_at IS NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 IF j->>'status' IS NULL OR j->>'status' NOT IN ('active','suspended') OR j->>'expected_status' IS NULL OR j->>'expected_status' NOT IN ('active','suspended') THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 IF r.status=j->>'status' THEN RETURN jsonb_build_object('status',r.status); END IF;
 IF r.status<>j->>'expected_status' THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 PERFORM n3a.append_fact(p,'partner',a,j->>'status',NULL,r.accepted_policy_id,u,t);
 UPDATE n3a.partners SET status=j->>'status' WHERE id=a;
 UPDATE n3a.memberships SET status=CASE WHEN j->>'status'='active' THEN 'active' ELSE 'revoked' END,scopes=ARRAY['read'] WHERE partner_id=a AND program_id=p AND role='partner';
 PERFORM n3a.audit(p,u,'partner_'||(j->>'status'),a,t); RETURN jsonb_build_object('status',j->>'status');
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_partner_status(bytea,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_partner_status(bytea,uuid,uuid,jsonb) TO n3a_app;
CREATE FUNCTION n3a.onboarding_revoke_asset(s bytea,p uuid,a uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE r n3a.partner_assets%ROWTYPE; partner uuid; pol uuid; u uuid; t timestamptz;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 PERFORM n3a.lock_program(p); SELECT partner_id INTO partner FROM n3a.partner_assets WHERE id=a AND program_id=p;
 PERFORM id FROM n3a.partners WHERE id=partner FOR UPDATE;
 u:=n3a.lock_identity(s,p); SELECT * INTO r FROM n3a.partner_assets WHERE id=a AND program_id=p FOR UPDATE;
 t:=clock_timestamp(); u:=n3a.check_identity(s,t); PERFORM n3a.authority(p,u,'invite',true);
 IF r.id IS NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 IF r.status='active' THEN
 SELECT accepted_policy_id INTO pol FROM n3a.partners WHERE id=partner;
 PERFORM n3a.append_fact(p,'asset',a,'revoked',r.expires_at,pol,u,t);
 UPDATE n3a.partner_assets SET status='revoked' WHERE id=a; PERFORM n3a.audit(p,u,'revoke_asset',a,t);
 END IF; RETURN jsonb_build_object('status','revoked');
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_revoke_asset(bytea,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_revoke_asset(bytea,uuid,uuid) TO n3a_app;
CREATE FUNCTION n3a.onboarding_eligibility(s bytea,p uuid,partner uuid,asset uuid,at_time timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE u uuid; t timestamptz; pf n3a.eligibility_facts%ROWTYPE; af n3a.eligibility_facts%ROWTYPE; outcome text;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 PERFORM n3a.lock_program(p); u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t); PERFORM n3a.authority(p,u,'read',true);
 IF at_time IS NULL OR at_time>t THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 IF NOT EXISTS(SELECT 1 FROM n3a.partner_assets WHERE id=asset AND partner_id=partner AND program_id=p) THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 SELECT * INTO pf FROM n3a.eligibility_facts WHERE program_id=p AND subject_kind='partner' AND subject_id=partner AND valid_from<=at_time ORDER BY valid_from DESC,version DESC LIMIT 1;
 SELECT * INTO af FROM n3a.eligibility_facts WHERE program_id=p AND subject_kind='asset' AND subject_id=asset AND valid_from<=at_time ORDER BY valid_from DESC,version DESC LIMIT 1;
 outcome:=CASE WHEN EXISTS(SELECT 1 FROM n3a.partners WHERE id=partner AND created_at>at_time)
 OR EXISTS(SELECT 1 FROM n3a.partner_assets WHERE id=asset AND created_at>at_time) THEN 'ineligible'
 WHEN pf.id IS NULL OR af.id IS NULL OR pf.consent_policy_id IS NULL OR af.consent_policy_id IS NULL THEN 'unknown'
 WHEN pf.status='active' AND af.status='active' AND (af.expires_at IS NULL OR at_time<af.expires_at) AND (pf.expires_at IS NULL OR at_time<pf.expires_at) THEN 'eligible' ELSE 'ineligible' END;
 RETURN jsonb_build_object('state',outcome,'partner_fact_id',pf.id,'asset_fact_id',af.id,'consent_policy_id',pf.consent_policy_id);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_eligibility(bytea,uuid,uuid,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_eligibility(bytea,uuid,uuid,uuid,timestamptz) TO n3a_app;
