-- Offline only. No EXECUTE grant to n3a_app, including the receipt/lock preflight.
CREATE FUNCTION n3a.bootstrap_prepare(j jsonb,input_hash_value bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE r n3a.bootstrap_receipts%ROWTYPE; p n3a.programs%ROWTYPE; g n3a.enrollment_grants%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(730310,1);
 SELECT * INTO r FROM n3a.bootstrap_receipts WHERE request_id=(j->>'request_id')::uuid;
 IF r.request_id IS NOT NULL THEN
 IF r.input_hash IS DISTINCT FROM input_hash_value THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 RETURN jsonb_build_object('program_id',r.program_id,'grant_id',r.owner_grant_id,'replayed',true);
 END IF;
 IF j->>'mode' IS NULL OR j->>'mode' NOT IN ('create','reissue') OR octet_length(input_hash_value) IS DISTINCT FROM 32
 OR NOT n3a.valid_evidence(j->'evidence'->'identity') OR NOT n3a.valid_evidence(j->'evidence'->'authority')
 OR j->>'external_actor_ref' IS NULL OR length(j->>'external_actor_ref') NOT BETWEEN 1 AND 256 THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 IF j->>'mode'='create' THEN
 IF EXISTS(SELECT 1 FROM n3a.bootstrap_receipts) THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 ELSE
 p:=n3a.lock_program((j->>'program_id')::uuid);
 SELECT * INTO g FROM n3a.enrollment_grants WHERE id=(j->>'previous_grant_id')::uuid AND program_id=p.id FOR UPDATE;
 IF p.owner_id IS NOT NULL OR g.id IS NULL OR g.role<>'owner' OR g.revoked_at IS NOT NULL OR g.consumed_at IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM n3a.bootstrap_receipts WHERE owner_grant_id=g.id AND program_id=p.id)
 OR EXISTS(SELECT 1 FROM n3a.bootstrap_receipts WHERE previous_grant_id=g.id) THEN PERFORM n3a.onboarding_fail('conflict'); END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION n3a.bootstrap_prepare(jsonb,bytea) FROM PUBLIC,n3a_app;
CREATE FUNCTION n3a.bootstrap_apply(j jsonb,input_hash_value bytea,identity bytea,token bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE result jsonb; p n3a.programs%ROWTYPE; gid uuid; previous uuid; t timestamptz; expiry timestamptz;
BEGIN
 result:=n3a.bootstrap_prepare(j,input_hash_value); IF result IS NOT NULL THEN RETURN result; END IF;
 t:=clock_timestamp(); expiry:=(j->>'expires_at')::timestamptz;
 IF expiry IS NULL OR expiry<=t OR expiry>t+interval '72 hours' OR octet_length(identity) IS DISTINCT FROM 32 OR octet_length(token) IS DISTINCT FROM 32 THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 IF j->>'mode'='create' THEN
 INSERT INTO n3a.programs(name,public_slug,created_at) VALUES(j->>'name',j->>'public_slug',t) RETURNING * INTO p;
 ELSE
 SELECT * INTO p FROM n3a.programs WHERE id=(j->>'program_id')::uuid;
 previous:=(j->>'previous_grant_id')::uuid;
 UPDATE n3a.enrollment_grants SET revoked_at=t WHERE id=previous;
 END IF;
 INSERT INTO n3a.enrollment_grants(tenant_id,program_id,created_at,invited_identity_hash,token_hash,role,scopes,expires_at,issuer_kind,external_actor_ref,identity_evidence,authority_evidence)
 VALUES(p.tenant_id,p.id,t,identity,token,'owner',ARRAY['read','configure','invite','payout','tax','reconcile'],expiry,'bootstrap',j->>'external_actor_ref',j->'evidence'->'identity',j->'evidence'->'authority') RETURNING id INTO gid;
 INSERT INTO n3a.bootstrap_receipts(request_id,created_at,program_id,input_hash,owner_grant_id,previous_grant_id,external_actor_ref,identity_evidence,authority_evidence)
 VALUES((j->>'request_id')::uuid,t,p.id,input_hash_value,gid,previous,j->>'external_actor_ref',j->'evidence'->'identity',j->'evidence'->'authority');
 PERFORM n3a.audit(p.id,NULL,'bootstrap',gid,t);
 RETURN jsonb_build_object('program_id',p.id,'grant_id',gid,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION n3a.bootstrap_apply(jsonb,bytea,bytea,bytea) FROM PUBLIC,n3a_app;
