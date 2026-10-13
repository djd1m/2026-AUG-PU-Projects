ALTER TABLE upload ADD COLUMN files_cleaned_at timestamptz, ADD COLUMN cleanup_attempted_at timestamptz;
CREATE TABLE job (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES account(id),
  upload_id uuid NOT NULL REFERENCES upload(id),
  style text NOT NULL CHECK (style IN ('warm','minimal','afrohemian','playful')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  fence integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 2),
  first_ticket_id uuid,
  lease_until timestamptz,
  heartbeat_at timestamptz,
  queue_deadline timestamptz NOT NULL,
  hard_deadline timestamptz NOT NULL,
  attempt_deadline timestamptz,
  output_key uuid UNIQUE,
  mode text CHECK (mode IN ('fixture','controlnet')),
  quality text NOT NULL DEFAULT 'unverified' CHECK (quality IN ('unverified','accepted','rejected')),
  reserved boolean NOT NULL DEFAULT true,
  failure_reason text,
  created_at timestamptz NOT NULL,
  finished_at timestamptz,
  deleted_at timestamptz,
  files_cleaned_at timestamptz,
  cleanup_attempted_at timestamptz,
  UNIQUE(account_id,idempotency_key)
);
CREATE INDEX job_owner ON job(account_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX job_queue ON job(status,created_at) WHERE deleted_at IS NULL AND status IN ('queued','running');
CREATE TABLE attempt_budget (
  bucket text NOT NULL CHECK (bucket IN ('platform','account')),
  owner text NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0 AND count <= 200),
  PRIMARY KEY(bucket,owner,day),
  CHECK ((bucket='platform' AND owner='platform') OR (bucket='account' AND count<=20))
);
CREATE TABLE attempt_ticket (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES job(id),
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 2),
  day date NOT NULL,
  consumed_at timestamptz,
  superseded boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX current_attempt_ticket ON attempt_ticket(job_id,attempt_number) WHERE NOT superseded;
ALTER TABLE job ADD FOREIGN KEY(first_ticket_id) REFERENCES attempt_ticket(id);
CREATE TABLE generation_evidence (
  job_id uuid PRIMARY KEY REFERENCES job(id),
  input_sha text NOT NULL CHECK (input_sha ~ '^[a-f0-9]{64}$'),
  output_sha text NOT NULL CHECK (output_sha ~ '^[a-f0-9]{64}$'),
  depth_sha text NOT NULL CHECK (depth_sha ~ '^[a-f0-9]{64}$'),
  config_sha text NOT NULL CHECK (config_sha ~ '^[a-f0-9]{64}$'),
  model_revisions jsonb NOT NULL,
  seed bigint NOT NULL,
  mode text NOT NULL CHECK (mode IN ('fixture','controlnet')),
  worker_source_revision text NOT NULL,
  hardware text NOT NULL,
  queue_ms bigint NOT NULL CHECK (queue_ms>=0),
  inference_ms bigint NOT NULL CHECK (inference_ms>=0),
  warm boolean NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE FUNCTION immutable_generation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'generation evidence is immutable'; END $$;
CREATE TRIGGER generation_evidence_immutable BEFORE UPDATE OR DELETE ON generation_evidence
  FOR EACH ROW EXECUTE FUNCTION immutable_generation_evidence();
