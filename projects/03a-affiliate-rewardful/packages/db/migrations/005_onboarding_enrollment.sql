CREATE FUNCTION n3a.onboarding_registration_preflight(h bytea,identity bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE g n3a.enrollment_grants%ROWTYPE; t timestamptz;
BEGIN
 g:=n3a.lock_grant(h);
 PERFORM u.id FROM n3a.users u WHERE u.id=g.issued_by ORDER BY u.id FOR SHARE;
 PERFORM m.id FROM n3a.memberships m WHERE m.program_id=g.program_id ORDER BY m.id FOR SHARE;
 t:=clock_timestamp(); PERFORM n3a.check_grant(g,identity,NULL,t,false);
 IF g.consumed_at IS NOT NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 IF EXISTS(SELECT 1 FROM n3a.users WHERE identity_hash=identity) THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 RETURN jsonb_build_object('allowed',true);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_registration_preflight(bytea,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_registration_preflight(bytea,bytea) TO n3a_app;
CREATE FUNCTION n3a.onboarding_register(h bytea,identity bytea,password text,session_hash bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE g n3a.enrollment_grants%ROWTYPE; u uuid; t timestamptz;
BEGIN
 IF octet_length(identity) IS DISTINCT FROM 32 OR octet_length(session_hash) IS DISTINCT FROM 32
 OR password IS NULL OR password !~ '^\$argon2id\$v=19\$m=65536,t=3,p=1\$[A-Za-z0-9+/]{22,86}\$[A-Za-z0-9+/]{43}$' THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 g:=n3a.lock_grant(h);
 PERFORM x.id FROM n3a.users x WHERE x.id=g.issued_by OR x.identity_hash=identity ORDER BY x.id FOR SHARE;
 PERFORM m.id FROM n3a.memberships m WHERE m.program_id=g.program_id ORDER BY m.id FOR UPDATE;
 t:=clock_timestamp(); PERFORM n3a.check_grant(g,identity,NULL,t,false);
 IF g.consumed_at IS NOT NULL OR g.enrolled_user_id IS NOT NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 IF EXISTS(SELECT 1 FROM n3a.users WHERE identity_hash=identity) THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 BEGIN INSERT INTO n3a.users(identity_hash,password_hash,created_at) VALUES(identity,password,t) RETURNING id INTO u;
 EXCEPTION WHEN unique_violation THEN PERFORM n3a.onboarding_fail('conflict'); END;
 UPDATE n3a.enrollment_grants SET enrolled_user_id=u WHERE id=g.id;
 INSERT INTO n3a.sessions(user_id,token_hash,created_at,expires_at) VALUES(u,session_hash,t,t+interval '24 hours');
 PERFORM n3a.audit(g.program_id,u,'register',g.id,t);
 RETURN jsonb_build_object('user_id',u,'expires_at',t+interval '24 hours');
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_register(bytea,bytea,text,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_register(bytea,bytea,text,bytea) TO n3a_app;
CREATE FUNCTION n3a.onboarding_bind(s bytea,h bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE g n3a.enrollment_grants%ROWTYPE; u uuid; identity bytea; t timestamptz;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 g:=n3a.lock_grant(h); u:=n3a.lock_identity(s,g.program_id); t:=clock_timestamp(); u:=n3a.check_identity(s,t);
 SELECT identity_hash INTO identity FROM n3a.users WHERE id=u;
 PERFORM n3a.check_grant(g,identity,u,t,false);
 IF g.enrolled_user_id IS NULL THEN
 UPDATE n3a.enrollment_grants SET enrolled_user_id=u WHERE id=g.id;
 PERFORM n3a.audit(g.program_id,u,'bind',g.id,t);
 END IF;
 RETURN n3a.grant_preview(g,t);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_bind(bytea,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_bind(bytea,bytea) TO n3a_app;
CREATE FUNCTION n3a.onboarding_preview(s bytea,h bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE g n3a.enrollment_grants%ROWTYPE; u uuid; identity bytea; t timestamptz;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 g:=n3a.lock_grant(h); u:=n3a.lock_identity(s,g.program_id); t:=clock_timestamp(); u:=n3a.check_identity(s,t);
 SELECT identity_hash INTO identity FROM n3a.users WHERE id=u; PERFORM n3a.check_grant(g,identity,u,t,true);
 RETURN n3a.grant_preview(g,t);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_preview(bytea,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_preview(bytea,bytea) TO n3a_app;
CREATE FUNCTION n3a.onboarding_accept(s bytea,h bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE g n3a.enrollment_grants%ROWTYPE; u uuid; identity bytea; t timestamptz; mid uuid;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 g:=n3a.lock_grant(h); u:=n3a.lock_identity(s,g.program_id); t:=clock_timestamp(); u:=n3a.check_identity(s,t);
 SELECT identity_hash INTO identity FROM n3a.users WHERE id=u; PERFORM n3a.check_grant(g,identity,u,t,true);
 IF g.role='partner' THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 IF g.consumed_at IS NOT NULL THEN SELECT id INTO mid FROM n3a.memberships WHERE source_grant_id=g.id AND user_id=u AND status='active';
 ELSE
 IF g.role='owner' THEN UPDATE n3a.programs SET owner_id=u WHERE id=g.program_id AND owner_id IS NULL; END IF;
 INSERT INTO n3a.memberships(tenant_id,program_id,user_id,created_at,role,scopes,status,source_grant_id)
 VALUES(g.tenant_id,g.program_id,u,t,g.role,g.scopes,'active',g.id) RETURNING id INTO mid;
 UPDATE n3a.enrollment_grants SET consumed_at=t WHERE id=g.id;
 PERFORM n3a.audit(g.program_id,u,'accept',g.id,t);
 END IF;
 RETURN jsonb_build_object('membership_id',mid,'program_id',g.program_id,'role',g.role);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_accept(bytea,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_accept(bytea,bytea) TO n3a_app;
CREATE FUNCTION n3a.onboarding_issue(s bytea,p uuid,j jsonb,identity bytea,h bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE pr n3a.programs%ROWTYPE; u uuid; t timestamptz; scopes_value text[]; gid uuid; pid uuid; expiry timestamptz;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 pr:=n3a.lock_program(p); u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t); PERFORM n3a.authority(p,u,'invite',true);
 scopes_value:=CASE WHEN j->>'role'='partner' THEN ARRAY['read'] ELSE ARRAY(SELECT jsonb_array_elements_text(j->'scopes')) END;
 expiry:=(j->>'expires_at')::timestamptz;
 IF j->>'role' NOT IN ('partner','operator') OR j->>'role' IS NULL OR NOT n3a.valid_scopes(j->>'role',scopes_value)
 OR NOT n3a.valid_evidence(j->'evidence'->'identity') OR NOT n3a.valid_evidence(j->'evidence'->'authority')
 OR expiry IS NULL OR expiry<=t OR expiry>t+interval '72 hours' THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 IF j->>'role'='partner' THEN
 INSERT INTO n3a.partners(tenant_id,program_id,created_at,status) VALUES(pr.tenant_id,p,t,'invited') RETURNING id INTO pid;
 PERFORM n3a.append_fact(p,'partner',pid,'invited',NULL,NULL,u,t);
 END IF;
 INSERT INTO n3a.enrollment_grants(tenant_id,program_id,created_at,invited_identity_hash,token_hash,role,scopes,partner_id,expires_at,issuer_kind,issued_by,identity_evidence,authority_evidence)
 VALUES(pr.tenant_id,p,t,identity,h,j->>'role',scopes_value,pid,expiry,'owner',u,j->'evidence'->'identity',j->'evidence'->'authority') RETURNING id INTO gid;
 IF pid IS NOT NULL THEN INSERT INTO n3a.invitations(tenant_id,program_id,partner_id,enrollment_grant_id,token_hash,expires_at)
 VALUES(pr.tenant_id,p,pid,gid,h,expiry); END IF;
 PERFORM n3a.audit(p,u,'issue',gid,t); RETURN jsonb_build_object('grant_id',gid,'partner_id',pid);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_issue(bytea,uuid,jsonb,bytea,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_issue(bytea,uuid,jsonb,bytea,bytea) TO n3a_app;
CREATE FUNCTION n3a.onboarding_revoke_grant(s bytea,p uuid,g uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE r n3a.enrollment_grants%ROWTYPE; u uuid; t timestamptz;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 PERFORM n3a.lock_program(p); SELECT * INTO r FROM n3a.enrollment_grants WHERE id=g AND program_id=p FOR UPDATE;
 u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t); PERFORM n3a.authority(p,u,'invite',true);
 IF r.id IS NULL OR r.role='owner' THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 IF r.consumed_at IS NOT NULL THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 IF r.revoked_at IS NULL THEN UPDATE n3a.enrollment_grants SET revoked_at=t WHERE id=g; PERFORM n3a.audit(p,u,'revoke_grant',g,t); END IF;
 RETURN jsonb_build_object('status','revoked');
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_revoke_grant(bytea,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_revoke_grant(bytea,uuid,uuid) TO n3a_app;
CREATE FUNCTION n3a.onboarding_revoke_operator(s bytea,p uuid,m uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE r n3a.memberships%ROWTYPE; u uuid; t timestamptz;
BEGIN
 PERFORM n3a.check_identity(s,clock_timestamp()); -- Deny invalid sessions before object existence or locks; recheck after locks below.
 PERFORM n3a.lock_program(p); u:=n3a.lock_identity(s,p); t:=clock_timestamp(); u:=n3a.check_identity(s,t); PERFORM n3a.authority(p,u,'invite',true);
 SELECT * INTO r FROM n3a.memberships WHERE id=m AND program_id=p AND role='operator';
 IF r.id IS NULL THEN PERFORM n3a.onboarding_fail('enrollment_unavailable'); END IF;
 IF r.status='active' THEN UPDATE n3a.memberships SET status='revoked' WHERE id=m; PERFORM n3a.audit(p,u,'revoke_operator',m,t); END IF;
 RETURN jsonb_build_object('status','revoked');
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_revoke_operator(bytea,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_revoke_operator(bytea,uuid,uuid) TO n3a_app;
