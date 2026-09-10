CREATE FUNCTION n3a.membership_json(m n3a.memberships) RETURNS jsonb LANGUAGE sql
SET search_path=pg_catalog,pg_temp AS $$ SELECT jsonb_build_object('id',m.id,'program_id',m.program_id,'program_name',p.name,'user_id',m.user_id,
 'role',m.role,'scopes',m.scopes,'partner_id',m.partner_id,'status',m.status,'partner_status',a.status)
 FROM n3a.programs p LEFT JOIN n3a.partners a ON a.id=m.partner_id WHERE p.id=m.program_id $$;
REVOKE ALL ON FUNCTION n3a.membership_json(n3a.memberships) FROM PUBLIC;
CREATE FUNCTION n3a.onboarding_me(s bytea,l integer,c uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE u uuid; t timestamptz; items jsonb; next_value uuid;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 u:=n3a.lock_identity(s,NULL);
 PERFORM m.id FROM n3a.memberships m WHERE m.user_id=u ORDER BY m.id FOR SHARE;
 t:=clock_timestamp(); u:=n3a.check_identity(s,t);
 IF l IS NULL OR l<1 OR l>100 THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 SELECT coalesce(jsonb_agg(n3a.membership_json(q) ORDER BY q.id),'[]'::jsonb) INTO items FROM
 (SELECT m.* FROM n3a.memberships m JOIN n3a.programs p ON p.id=m.program_id LEFT JOIN n3a.partners a ON a.id=m.partner_id
 WHERE m.user_id=u AND m.status='active' AND (m.role<>'owner' OR p.owner_id=u) AND (m.role<>'partner' OR a.status='active')
 AND (c IS NULL OR m.id>c) ORDER BY m.id LIMIT l+1) q;
 IF jsonb_array_length(items)>l THEN next_value:=(items->(l-1)->>'id')::uuid; items:=items-l; END IF;
 RETURN jsonb_build_object('user_id',u,'memberships',jsonb_build_object('items',items,'next_cursor',next_value));
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_me(bytea,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_me(bytea,integer,uuid) TO n3a_app;
CREATE FUNCTION n3a.onboarding_program(s bytea,p uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE pr n3a.programs%ROWTYPE; u uuid; t timestamptz; m n3a.memberships%ROWTYPE; pol jsonb; latest integer;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 pr:=n3a.lock_program(p); u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t); m:=n3a.authority(p,u,'read',false);
 pol:=n3a.policy_json(p,t); SELECT coalesce(max(version),0) INTO latest FROM n3a.policy_versions WHERE program_id=p;
 RETURN jsonb_build_object('id',p,'name',pr.name,'public_slug',pr.public_slug,'currency',pr.currency,'program_status',pr.status,'integration_status','not_ready',
 'role',m.role,'scopes',m.scopes,'partner_id',m.partner_id,'current_policy',pol,'latest_version',latest,'timezone',pol->>'timezone','calendar_locked_at',pr.calendar_locked_at);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_program(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_program(bytea,uuid) TO n3a_app;
CREATE FUNCTION n3a.onboarding_members(s bytea,p uuid,l integer,mc uuid,gc uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE u uuid; t timestamptz; members jsonb; grants jsonb; mn uuid; gn uuid;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 PERFORM n3a.lock_program(p); u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t); PERFORM n3a.authority(p,u,'read',true);
 IF l IS NULL OR l<1 OR l>100 THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 SELECT coalesce(jsonb_agg(n3a.membership_json(q) ORDER BY q.id),'[]'::jsonb) INTO members FROM
 (SELECT * FROM n3a.memberships WHERE program_id=p AND (mc IS NULL OR id>mc) ORDER BY id LIMIT l+1) q;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'role',q.role,'scopes',q.scopes,'partner_id',q.partner_id,'expires_at',q.expires_at,'revoked_at',q.revoked_at,'consumed_at',q.consumed_at) ORDER BY q.id),'[]'::jsonb)
 INTO grants FROM (SELECT * FROM n3a.enrollment_grants WHERE program_id=p AND (gc IS NULL OR id>gc) ORDER BY id LIMIT l+1) q;
 IF jsonb_array_length(members)>l THEN mn:=(members->(l-1)->>'id')::uuid; members:=members-l; END IF;
 IF jsonb_array_length(grants)>l THEN gn:=(grants->(l-1)->>'id')::uuid; grants:=grants-l; END IF;
 RETURN jsonb_build_object('members',jsonb_build_object('items',members,'next_cursor',mn),'grants',jsonb_build_object('items',grants,'next_cursor',gn));
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_members(bytea,uuid,integer,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_members(bytea,uuid,integer,uuid,uuid) TO n3a_app;
CREATE FUNCTION n3a.onboarding_assets(s bytea,p uuid,a uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE u uuid; t timestamptz; m n3a.memberships%ROWTYPE; result jsonb;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 PERFORM n3a.lock_program(p); u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t); m:=n3a.authority(p,u,'read',false);
 IF m.role='partner' THEN
 IF a IS NOT NULL AND a<>m.partner_id THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF; a:=m.partner_id;
 ELSIF m.role<>'owner' OR a IS NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 result:=n3a.partner_assets_json(p,a);
 IF result IS NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF; RETURN result;
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_assets(bytea,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_assets(bytea,uuid,uuid) TO n3a_app;
