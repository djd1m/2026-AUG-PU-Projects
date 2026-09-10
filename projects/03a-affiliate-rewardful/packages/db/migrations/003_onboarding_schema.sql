CREATE FUNCTION n3a.valid_scopes(r text, s text[]) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp AS $$ SELECT s IS NOT NULL AND cardinality(s)>0
 AND array_position(s,NULL) IS NULL AND cardinality(s)=(SELECT count(DISTINCT x) FROM unnest(s) x)
 AND CASE r WHEN 'owner' THEN s @> ARRAY['read','configure','invite','payout','tax','reconcile'] AND s <@ ARRAY['read','configure','invite','payout','tax','reconcile']
 WHEN 'operator' THEN s <@ ARRAY['read','payout','tax','reconcile'] WHEN 'partner' THEN s=ARRAY['read'] ELSE false END $$;
REVOKE ALL ON FUNCTION n3a.valid_scopes(text,text[]) FROM PUBLIC;
CREATE FUNCTION n3a.valid_evidence(e jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp AS $$ SELECT COALESCE(jsonb_typeof(e)='object' AND jsonb_typeof(e->'reference')='string'
 AND length(e->>'reference') BETWEEN 1 AND 256 AND (e->>'reference') !~ '[[:cntrl:]]'
 AND (e->>'sha256') ~ '^[a-f0-9]{64}$',false) $$;
REVOKE ALL ON FUNCTION n3a.valid_evidence(jsonb) FROM PUBLIC;
CREATE TABLE n3a.programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), owner_id uuid REFERENCES n3a.users(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), public_slug text NOT NULL UNIQUE CHECK(public_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
 purpose text NOT NULL DEFAULT 'n1_commissions' CHECK(purpose='n1_commissions'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused')),
 currency text NOT NULL DEFAULT 'RUB' CHECK(currency='RUB'), timezone text, calendar_locked_at timestamptz, current_policy_id uuid,
 UNIQUE(tenant_id,id), CHECK(status='draft' OR (owner_id IS NOT NULL AND timezone IS NOT NULL))
);
CREATE TABLE n3a.policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, program_id uuid NOT NULL,
 created_at timestamptz NOT NULL, version integer NOT NULL CHECK(version>0), effective_at timestamptz NOT NULL,
 rate_bp integer NOT NULL CHECK(rate_bp BETWEEN 1 AND 10000), attribution_days integer NOT NULL CHECK(attribution_days IN (30,60,90)),
 conflict_rule text NOT NULL CHECK(conflict_rule='explicit_promo_else_last_valid_cookie'), recurring_mode text NOT NULL CHECK(recurring_mode='every_eligible_payment'),
 commission_duration text NOT NULL CHECK(commission_duration='lifetime'), currency text NOT NULL CHECK(currency='RUB'), timezone text NOT NULL,
 terms_text text NOT NULL CHECK(octet_length(terms_text) BETWEEN 1 AND 16384 AND terms_text !~ '[\x01-\x08\x0b-\x1f\x7f]'),
 terms_hash bytea NOT NULL CHECK(octet_length(terms_hash)=32),
 UNIQUE(tenant_id,program_id,id), UNIQUE(program_id,version), UNIQUE(program_id,effective_at),
 FOREIGN KEY(tenant_id,program_id) REFERENCES n3a.programs(tenant_id,id)
);
ALTER TABLE n3a.programs ADD FOREIGN KEY(tenant_id,id,current_policy_id) REFERENCES n3a.policy_versions(tenant_id,program_id,id);
CREATE TABLE n3a.partners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, program_id uuid NOT NULL, created_at timestamptz NOT NULL,
 user_id uuid REFERENCES n3a.users(id), status text NOT NULL CHECK(status IN ('invited','active','suspended')),
 accepted_policy_id uuid, accepted_at timestamptz,
 UNIQUE(tenant_id,program_id,id), UNIQUE(program_id,user_id), UNIQUE(tenant_id,program_id,id,user_id),
 FOREIGN KEY(tenant_id,program_id) REFERENCES n3a.programs(tenant_id,id),
 FOREIGN KEY(tenant_id,program_id,accepted_policy_id) REFERENCES n3a.policy_versions(tenant_id,program_id,id),
 CHECK((status='invited' AND user_id IS NULL AND accepted_at IS NULL AND accepted_policy_id IS NULL) OR
 (status IN ('active','suspended') AND user_id IS NOT NULL AND accepted_at IS NOT NULL AND accepted_policy_id IS NOT NULL))
);
CREATE TABLE n3a.enrollment_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, program_id uuid NOT NULL, created_at timestamptz NOT NULL,
 invited_identity_hash bytea NOT NULL CHECK(octet_length(invited_identity_hash)=32), token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
 role text NOT NULL CHECK(role IN ('owner','operator','partner')), scopes text[] NOT NULL, partner_id uuid,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, consumed_at timestamptz, enrolled_user_id uuid REFERENCES n3a.users(id),
 issuer_kind text NOT NULL CHECK(issuer_kind IN ('bootstrap','owner')), issued_by uuid REFERENCES n3a.users(id), external_actor_ref text,
 identity_evidence jsonb NOT NULL CHECK(n3a.valid_evidence(identity_evidence)), authority_evidence jsonb NOT NULL CHECK(n3a.valid_evidence(authority_evidence)),
 UNIQUE(program_id,id), UNIQUE(tenant_id,program_id,id), UNIQUE(tenant_id,program_id,id,partner_id), UNIQUE(tenant_id,program_id,id,partner_id,token_hash),
 UNIQUE(tenant_id,program_id,id,enrolled_user_id,role),
 FOREIGN KEY(tenant_id,program_id) REFERENCES n3a.programs(tenant_id,id),
 FOREIGN KEY(tenant_id,program_id,partner_id) REFERENCES n3a.partners(tenant_id,program_id,id),
 CHECK(n3a.valid_scopes(role,scopes)), CHECK((role='partner')=(partner_id IS NOT NULL)),
 CHECK((role='owner' AND issuer_kind='bootstrap' AND issued_by IS NULL AND external_actor_ref IS NOT NULL AND length(external_actor_ref) BETWEEN 1 AND 256)
 OR (role IN ('operator','partner') AND issuer_kind='owner' AND issued_by IS NOT NULL AND external_actor_ref IS NULL)),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '72 hours'),
 CHECK(consumed_at IS NULL OR enrolled_user_id IS NOT NULL), CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE TABLE n3a.bootstrap_receipts (
 request_id uuid PRIMARY KEY, created_at timestamptz NOT NULL, program_id uuid NOT NULL REFERENCES n3a.programs(id),
 input_hash bytea NOT NULL CHECK(octet_length(input_hash)=32), owner_grant_id uuid NOT NULL UNIQUE REFERENCES n3a.enrollment_grants(id),
 previous_grant_id uuid UNIQUE REFERENCES n3a.enrollment_grants(id), external_actor_ref text NOT NULL,
 identity_evidence jsonb NOT NULL CHECK(n3a.valid_evidence(identity_evidence)), authority_evidence jsonb NOT NULL CHECK(n3a.valid_evidence(authority_evidence)),
 FOREIGN KEY(program_id,owner_grant_id) REFERENCES n3a.enrollment_grants(program_id,id),
 FOREIGN KEY(program_id,previous_grant_id) REFERENCES n3a.enrollment_grants(program_id,id)
);
CREATE UNIQUE INDEX bootstrap_single_pilot ON n3a.bootstrap_receipts ((true)) WHERE previous_grant_id IS NULL;
CREATE TABLE n3a.memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, program_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES n3a.users(id),
 created_at timestamptz NOT NULL, role text NOT NULL, scopes text[] NOT NULL, partner_id uuid, source_grant_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('active','revoked')), UNIQUE(program_id,user_id,role), UNIQUE(tenant_id,program_id,id),
 FOREIGN KEY(tenant_id,program_id) REFERENCES n3a.programs(tenant_id,id),
 FOREIGN KEY(tenant_id,program_id,source_grant_id,user_id,role) REFERENCES n3a.enrollment_grants(tenant_id,program_id,id,enrolled_user_id,role),
 FOREIGN KEY(tenant_id,program_id,partner_id,user_id) REFERENCES n3a.partners(tenant_id,program_id,id,user_id),
 CHECK(n3a.valid_scopes(role,scopes)), CHECK((role='partner')=(partner_id IS NOT NULL))
);
CREATE TABLE n3a.invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, program_id uuid NOT NULL, partner_id uuid NOT NULL,
 enrollment_grant_id uuid NOT NULL UNIQUE, token_hash bytea NOT NULL CHECK(octet_length(token_hash)=32), expires_at timestamptz NOT NULL, consumed_at timestamptz,
 FOREIGN KEY(tenant_id,program_id,enrollment_grant_id,partner_id,token_hash) REFERENCES n3a.enrollment_grants(tenant_id,program_id,id,partner_id,token_hash)
);
CREATE TABLE n3a.partner_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, program_id uuid NOT NULL, partner_id uuid NOT NULL, created_at timestamptz NOT NULL,
 kind text NOT NULL CHECK(kind IN ('link','promo')), public_code text NOT NULL UNIQUE CHECK(public_code ~ '^[A-Za-z0-9_-]{22}$'),
 status text NOT NULL CHECK(status IN ('active','revoked')), expires_at timestamptz, cohort text NOT NULL,
 UNIQUE(program_id,partner_id,kind), UNIQUE(tenant_id,program_id,id),
 FOREIGN KEY(tenant_id,program_id,partner_id) REFERENCES n3a.partners(tenant_id,program_id,id)
);
CREATE TABLE n3a.eligibility_facts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, program_id uuid NOT NULL, subject_kind text NOT NULL CHECK(subject_kind IN ('partner','asset')),
 subject_id uuid NOT NULL, partner_id uuid, asset_id uuid, version integer NOT NULL CHECK(version>0), valid_from timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('invited','active','suspended','revoked')), expires_at timestamptz, consent_policy_id uuid,
 actor_id uuid REFERENCES n3a.users(id), evidence jsonb NOT NULL CHECK(n3a.valid_evidence(evidence)),
 UNIQUE(subject_kind,subject_id,version),
 FOREIGN KEY(tenant_id,program_id) REFERENCES n3a.programs(tenant_id,id),
 FOREIGN KEY(tenant_id,program_id,partner_id) REFERENCES n3a.partners(tenant_id,program_id,id),
 FOREIGN KEY(tenant_id,program_id,asset_id) REFERENCES n3a.partner_assets(tenant_id,program_id,id),
 FOREIGN KEY(tenant_id,program_id,consent_policy_id) REFERENCES n3a.policy_versions(tenant_id,program_id,id),
 CHECK((subject_kind='partner' AND partner_id IS NOT NULL AND partner_id=subject_id AND asset_id IS NULL) OR (subject_kind='asset' AND asset_id IS NOT NULL AND asset_id=subject_id AND partner_id IS NULL))
);
CREATE INDEX eligibility_history ON n3a.eligibility_facts(tenant_id,program_id,subject_kind,subject_id,valid_from DESC,version DESC);
CREATE TABLE n3a.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL, actor_id uuid REFERENCES n3a.users(id), program_id uuid REFERENCES n3a.programs(id),
 action text NOT NULL CHECK(action IN ('bootstrap','register','bind','accept','policy','issue','revoke_grant','revoke_operator','partner_active','partner_suspended','revoke_asset')),
 target_id uuid, result text NOT NULL DEFAULT 'applied' CHECK(result='applied'), correlation_id uuid NOT NULL DEFAULT gen_random_uuid()
);
REVOKE ALL ON n3a.programs,n3a.policy_versions,n3a.partners,n3a.enrollment_grants,n3a.bootstrap_receipts,n3a.memberships,n3a.invitations,n3a.partner_assets,n3a.eligibility_facts,n3a.audit_events FROM PUBLIC,n3a_app;
