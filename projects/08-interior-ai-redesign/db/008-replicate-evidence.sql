-- Append only: no column additions/historical row writes. SELECT * legacy oracles
-- and canonical evidence/hash bytes remain unchanged; immutable trigger stays.
ALTER TABLE job DROP CONSTRAINT job_mode_check;
ALTER TABLE job ADD CONSTRAINT job_mode_check CHECK (mode IN ('fixture','controlnet','replicate'));
ALTER TABLE generation_evidence DROP CONSTRAINT generation_evidence_mode_check;
ALTER TABLE generation_evidence ADD CONSTRAINT generation_evidence_mode_check
  CHECK (mode IN ('fixture','controlnet','replicate'));
ALTER TABLE generation_evidence
  ALTER COLUMN model_revisions DROP NOT NULL,
  ALTER COLUMN hardware DROP NOT NULL,
  ALTER COLUMN inference_ms DROP NOT NULL,
  ALTER COLUMN warm DROP NOT NULL;
ALTER TABLE generation_evidence ADD CONSTRAINT generation_evidence_mode_fields CHECK (
  (mode IN ('fixture','controlnet') AND model_revisions IS NOT NULL AND hardware IS NOT NULL
    AND inference_ms IS NOT NULL AND warm IS NOT NULL)
  OR
  (mode='replicate' AND model_revisions IS NULL AND hardware IS NULL AND inference_ms IS NULL
    AND warm IS NULL AND seed BETWEEN 0 AND 2147483647
    AND canonical_evidence IS NOT NULL AND evidence_sha IS NOT NULL
    AND jsonb_typeof(canonical_evidence)='object'
    AND canonical_evidence ?& ARRAY[
      'schema_version','mode','provider','quality','submission_id',
      'prediction_id','model','version','contract_sha','request_sha',
      'source_input_sha','transmitted_input_sha','transform','raw_provider_depth_sha','raw_provider_output_sha',
      'depth_sha','output_sha','input_sha','config_sha','artifact_key',
      'hardware','warm','inference_ms','billing_actual_microusd','evidence_version',
      'job_id','seed','style','worker_source_revision','queue_ms',
      'local_elapsed_ms','metric_sources','job_created_at','attempt_started_at','local_started_at',
      'artifacts_verified_at','output_key']
    AND (canonical_evidence - ARRAY[
      'schema_version','mode','provider','quality','submission_id',
      'prediction_id','model','version','contract_sha','request_sha',
      'source_input_sha','transmitted_input_sha','transform','raw_provider_depth_sha','raw_provider_output_sha',
      'depth_sha','output_sha','input_sha','config_sha','artifact_key',
      'hardware','warm','inference_ms','billing_actual_microusd','evidence_version',
      'job_id','seed','style','worker_source_revision','queue_ms',
      'local_elapsed_ms','metric_sources','job_created_at','attempt_started_at','local_started_at',
      'artifacts_verified_at','output_key'])='{}'::jsonb
    AND jsonb_typeof(canonical_evidence->'local_elapsed_ms')='number'
    AND ((canonical_evidence->>'local_elapsed_ms')::numeric BETWEEN 0 AND 180000) IS TRUE
    AND ((canonical_evidence->>'local_elapsed_ms')::numeric=trunc((canonical_evidence->>'local_elapsed_ms')::numeric)) IS TRUE
    AND (canonical_evidence->>'schema_version'='1') IS TRUE
    AND (canonical_evidence->>'evidence_version'='1') IS TRUE
    AND (canonical_evidence->>'provider'='replicate') IS TRUE
    AND (canonical_evidence->>'source_input_sha'=input_sha) IS TRUE
    AND (canonical_evidence->>'artifact_key'=canonical_evidence->>'output_key') IS TRUE
    AND (canonical_evidence->>'raw_provider_depth_sha' ~ '^[a-f0-9]{64}$') IS TRUE
    AND (canonical_evidence->>'raw_provider_output_sha' ~ '^[a-f0-9]{64}$') IS TRUE
    AND worker_source_revision ~ '^[a-f0-9]{40,64}$'
    AND (canonical_evidence->>'mode'='replicate') IS TRUE
    AND (canonical_evidence->>'quality'='unverified') IS TRUE
    AND (canonical_evidence->>'job_id'=job_id::text) IS TRUE
    AND (canonical_evidence->>'input_sha'=input_sha) IS TRUE
    AND (canonical_evidence->>'output_sha'=output_sha) IS TRUE
    AND (canonical_evidence->>'depth_sha'=depth_sha) IS TRUE
    AND (canonical_evidence->>'config_sha'=config_sha) IS TRUE
    AND (canonical_evidence->>'seed'=seed::text) IS TRUE
    AND (canonical_evidence->>'queue_ms'=queue_ms::text) IS TRUE
    AND (canonical_evidence->>'worker_source_revision'=worker_source_revision) IS TRUE
    AND (canonical_evidence->'metric_sources'=
      '{"queue_ms":"database_timestamps","local_elapsed_ms":"worker_monotonic","hardware":null,"warm":null,"inference_ms":null,"billing_actual_microusd":null}'::jsonb) IS TRUE
    AND (canonical_evidence->'hardware'='null'::jsonb) IS TRUE
    AND (canonical_evidence->'warm'='null'::jsonb) IS TRUE
    AND (canonical_evidence->'inference_ms'='null'::jsonb) IS TRUE
    AND (canonical_evidence->'billing_actual_microusd'='null'::jsonb) IS TRUE)
);
CREATE UNIQUE INDEX generation_evidence_hosted_submission
  ON generation_evidence ((canonical_evidence->>'submission_id')) WHERE mode='replicate';
CREATE FUNCTION bind_generation_evidence_mode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mode<>'replicate' THEN
    IF EXISTS(SELECT 1 FROM provider_submission WHERE job_id=NEW.job_id) THEN
      RAISE EXCEPTION 'local evidence cannot bind hosted submission';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM provider_submission s JOIN job j ON j.id=s.job_id
    WHERE s.job_id=NEW.job_id AND s.id::text=NEW.canonical_evidence->>'submission_id'
      AND s.prediction_id=NEW.canonical_evidence->>'prediction_id' AND s.provider_status='succeeded'
      AND s.state IN ('known','terminal') AND s.cleanup_state='none' AND s.identity_conflict_at IS NULL
      AND s.model=NEW.canonical_evidence->>'model' AND s.version=NEW.canonical_evidence->>'version'
      AND s.contract_sha=NEW.canonical_evidence->>'contract_sha'
      AND s.request_sha=NEW.canonical_evidence->>'request_sha'
      AND s.source_input_sha=NEW.input_sha
      AND s.transmitted_input_sha=NEW.canonical_evidence->>'transmitted_input_sha'
      AND s.transform=NEW.canonical_evidence->'transform'
      AND j.mode IS NULL AND j.status='running' AND j.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'hosted evidence submission binding mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER generation_evidence_mode_binding BEFORE INSERT ON generation_evidence
  FOR EACH ROW EXECUTE FUNCTION bind_generation_evidence_mode();
