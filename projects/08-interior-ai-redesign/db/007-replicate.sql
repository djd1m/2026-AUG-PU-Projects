-- Admission authority only. No initial envelope: live spend remains disabled.
-- All application writers lock account -> job -> submission -> envelope;
-- current-UTC ticket allocation locks platform/account buckets before account.
CREATE TABLE provider_spend_budget (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  authorization_id uuid NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency='USD'),
  model text NOT NULL CHECK (model ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+$'),
  version text NOT NULL CHECK (version ~ '^[a-f0-9]{64}$'),
  contract_sha text NOT NULL CHECK (contract_sha ~ '^[a-f0-9]{64}$'),
  authorization_sha text NOT NULL CHECK (authorization_sha ~ '^[a-f0-9]{64}$'),
  privacy_acceptance_sha text NOT NULL CHECK (privacy_acceptance_sha ~ '^[a-f0-9]{64}$'),
  license_acceptance_sha text NOT NULL CHECK (license_acceptance_sha ~ '^[a-f0-9]{64}$'),
  safety_acceptance_sha text NOT NULL CHECK (safety_acceptance_sha ~ '^[a-f0-9]{64}$'),
  billing_acceptance_sha text NOT NULL CHECK (billing_acceptance_sha ~ '^[a-f0-9]{64}$'),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL CHECK (window_end>window_start),
  ceiling_microusd bigint NOT NULL CHECK (ceiling_microusd>=0),
  per_create_ceiling_microusd bigint NOT NULL CHECK (per_create_ceiling_microusd>0),
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_microusd>=0 AND reserved_microusd<=ceiling_microusd),
  revoked_at timestamptz
);
CREATE FUNCTION protect_provider_spend_budget() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'provider budget is immutable'; END IF;
  IF (to_jsonb(NEW)-'reserved_microusd'-'revoked_at') IS DISTINCT FROM
     (to_jsonb(OLD)-'reserved_microusd'-'revoked_at') OR
     NEW.reserved_microusd<OLD.reserved_microusd OR
     (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'provider budget is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER provider_spend_budget_protected BEFORE UPDATE OR DELETE ON provider_spend_budget
  FOR EACH ROW EXECUTE FUNCTION protect_provider_spend_budget();

CREATE FUNCTION provider_transform_valid(t jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r jsonb; k text; n numeric;
BEGIN
  IF jsonb_typeof(t)<>'object' OR
     (t-ARRAY['original_width','original_height','canvas_width','canvas_height','content_rect'])<>'{}'::jsonb THEN RETURN false; END IF;
  r=t->'content_rect';
  IF r IS NULL OR jsonb_typeof(r)<>'object' OR (r-ARRAY['x','y','width','height'])<>'{}'::jsonb THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['original_width','original_height','canvas_width','canvas_height'] LOOP
    IF jsonb_typeof(t->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    n=(t->>k)::numeric;
    IF n<>trunc(n) OR n<1 OR n>20000000 THEN RETURN false; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['x','y','width','height'] LOOP
    IF jsonb_typeof(r->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    n=(r->>k)::numeric;
    IF n<>trunc(n) OR n<0 OR n>512 OR (k IN ('width','height') AND n=0) THEN RETURN false; END IF;
  END LOOP;
  RETURN (t->>'canvas_width')::numeric=512 AND (t->>'canvas_height')::numeric=512 AND
    (t->>'original_width')::numeric*(t->>'original_height')::numeric<=20000000 AND
    (r->>'x')::numeric+(r->>'width')::numeric<=512 AND (r->>'y')::numeric+(r->>'height')::numeric<=512;
END $$;
CREATE TABLE provider_submission (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  job_id uuid NOT NULL UNIQUE REFERENCES job(id),
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 2),
  attempt_ticket_id uuid NOT NULL REFERENCES attempt_ticket(id),
  submission_fence integer NOT NULL CHECK (submission_fence>0),
  provider text NOT NULL DEFAULT 'replicate' CHECK (provider='replicate'),
  model text NOT NULL CHECK (model ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+$'),
  version text NOT NULL CHECK (version ~ '^[a-f0-9]{64}$'),
  contract_sha text NOT NULL CHECK (contract_sha ~ '^[a-f0-9]{64}$'),
  source_input_sha text NOT NULL CHECK (source_input_sha ~ '^[a-f0-9]{64}$'),
  transmitted_input_sha text NOT NULL CHECK (transmitted_input_sha ~ '^[a-f0-9]{64}$'),
  request_sha text NOT NULL CHECK (request_sha ~ '^[a-f0-9]{64}$'),
  transform jsonb NOT NULL CHECK (provider_transform_valid(transform)),
  attempt_deadline timestamptz NOT NULL,
  spend_budget_id uuid NOT NULL REFERENCES provider_spend_budget(id),
  authorization_sha text NOT NULL CHECK (authorization_sha ~ '^[a-f0-9]{64}$'),
  privacy_acceptance_sha text NOT NULL CHECK (privacy_acceptance_sha ~ '^[a-f0-9]{64}$'),
  license_acceptance_sha text NOT NULL CHECK (license_acceptance_sha ~ '^[a-f0-9]{64}$'),
  safety_acceptance_sha text NOT NULL CHECK (safety_acceptance_sha ~ '^[a-f0-9]{64}$'),
  billing_acceptance_sha text NOT NULL CHECK (billing_acceptance_sha ~ '^[a-f0-9]{64}$'),
  spend_reserved_microusd bigint NOT NULL CHECK (spend_reserved_microusd>0),
  state text NOT NULL DEFAULT 'preflight' CHECK (state IN ('preflight','submitting','known','ambiguous','terminal')),
  prediction_id text UNIQUE CHECK (prediction_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  provider_status text CHECK (provider_status IN ('starting','processing','succeeded','failed','canceled','aborted')),
  submitting_at timestamptz,
  observed_at timestamptz,
  identity_conflict_at timestamptz,
  cancel_requested_at timestamptz,
  cancel_confirmed_at timestamptz,
  cleanup_state text NOT NULL DEFAULT 'none' CHECK (cleanup_state IN ('none','needed','claimed','done','unresolved')),
  cleanup_fence integer NOT NULL DEFAULT 0 CHECK (cleanup_fence>=0),
  cleanup_lease_until timestamptz,
  billing_actual_microusd bigint CHECK (billing_actual_microusd>=0),
  CHECK ((state='preflight' AND submitting_at IS NULL AND prediction_id IS NULL) OR
         (state<>'preflight' AND submitting_at IS NOT NULL)),
  CHECK (state<>'known' OR prediction_id IS NOT NULL),
  CHECK (state<>'ambiguous' OR prediction_id IS NULL),
  CHECK (provider_status IS NULL OR prediction_id IS NOT NULL)
);
CREATE INDEX provider_submission_cleanup ON provider_submission(cleanup_state,created_at)
  WHERE cleanup_state IN ('needed','claimed');
CREATE FUNCTION protect_provider_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'preflight' OR NEW.prediction_id IS NOT NULL OR NEW.provider_status IS NOT NULL OR
       NOT EXISTS (SELECT 1 FROM job j JOIN attempt_ticket t ON t.job_id=j.id
         JOIN upload u ON u.id=j.upload_id AND u.account_id=j.account_id
         WHERE j.id=NEW.job_id AND j.attempts=NEW.attempt_number AND j.fence=NEW.submission_fence
         AND j.attempt_deadline=NEW.attempt_deadline AND t.id=NEW.attempt_ticket_id
         AND t.attempt_number=NEW.attempt_number AND t.consumed_at IS NOT NULL AND NOT t.superseded
         AND u.sha256=NEW.source_input_sha AND u.deleted_at IS NULL AND j.deleted_at IS NULL) OR
       NOT EXISTS (SELECT 1 FROM provider_spend_budget b WHERE b.id=NEW.spend_budget_id
         AND ROW(b.model,b.version,b.contract_sha,b.authorization_sha,b.privacy_acceptance_sha,
           b.license_acceptance_sha,b.safety_acceptance_sha,b.billing_acceptance_sha,b.per_create_ceiling_microusd)=
         ROW(NEW.model,NEW.version,NEW.contract_sha,NEW.authorization_sha,NEW.privacy_acceptance_sha,
           NEW.license_acceptance_sha,NEW.safety_acceptance_sha,NEW.billing_acceptance_sha,NEW.spend_reserved_microusd)) THEN
      RAISE EXCEPTION 'provider submission binding mismatch';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'provider submission is immutable'; END IF;
  IF ROW(NEW.id,NEW.created_at,NEW.job_id,NEW.attempt_number,NEW.attempt_ticket_id,NEW.submission_fence,
         NEW.provider,NEW.model,NEW.version,NEW.contract_sha,NEW.source_input_sha,NEW.transmitted_input_sha,
         NEW.request_sha,NEW.transform,NEW.attempt_deadline,NEW.spend_budget_id,NEW.authorization_sha,
         NEW.privacy_acceptance_sha,NEW.license_acceptance_sha,NEW.safety_acceptance_sha,
         NEW.billing_acceptance_sha,NEW.spend_reserved_microusd) IS DISTINCT FROM
     ROW(OLD.id,OLD.created_at,OLD.job_id,OLD.attempt_number,OLD.attempt_ticket_id,OLD.submission_fence,
         OLD.provider,OLD.model,OLD.version,OLD.contract_sha,OLD.source_input_sha,OLD.transmitted_input_sha,
         OLD.request_sha,OLD.transform,OLD.attempt_deadline,OLD.spend_budget_id,OLD.authorization_sha,
         OLD.privacy_acceptance_sha,OLD.license_acceptance_sha,OLD.safety_acceptance_sha,
         OLD.billing_acceptance_sha,OLD.spend_reserved_microusd) OR
     (OLD.prediction_id IS NOT NULL AND NEW.prediction_id IS DISTINCT FROM OLD.prediction_id) OR
     (OLD.submitting_at IS NOT NULL AND NEW.submitting_at IS DISTINCT FROM OLD.submitting_at) OR
     (OLD.identity_conflict_at IS NOT NULL AND NEW.identity_conflict_at IS DISTINCT FROM OLD.identity_conflict_at) THEN
    RAISE EXCEPTION 'provider submission binding is immutable';
  END IF;
  IF NEW.state<>OLD.state AND NOT (
    (OLD.state='preflight' AND NEW.state='submitting') OR
    (OLD.state='submitting' AND NEW.state IN ('known','ambiguous','terminal')) OR
    (OLD.state='ambiguous' AND NEW.state IN ('known','terminal')) OR
    (OLD.state='known' AND NEW.state='terminal')) THEN
    RAISE EXCEPTION 'provider submission state regression';
  END IF;
  IF (OLD.provider_status IN ('succeeded','failed','canceled','aborted') AND
      NEW.provider_status IS DISTINCT FROM OLD.provider_status) OR
     (OLD.provider_status='processing' AND (NEW.provider_status IS NULL OR NEW.provider_status='starting')) OR
     (OLD.provider_status='starting' AND NEW.provider_status IS NULL) THEN
    RAISE EXCEPTION 'provider status regression';
  END IF;
  IF NEW.cleanup_fence<OLD.cleanup_fence THEN RAISE EXCEPTION 'provider cleanup fence regression'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER provider_submission_protected BEFORE INSERT OR UPDATE OR DELETE ON provider_submission
  FOR EACH ROW EXECUTE FUNCTION protect_provider_submission();
-- Existing job/evidence mode checks and immutable evidence triggers stay intact.
-- I5 must add discriminated hosted evidence constraints, never fake local revisions.
