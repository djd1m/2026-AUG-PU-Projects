ALTER TABLE generation_evidence ADD COLUMN canonical_evidence jsonb,
  ADD COLUMN evidence_sha text CHECK (evidence_sha ~ '^[a-f0-9]{64}$');
CREATE TABLE quality_review (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES job(id),
  actor text NOT NULL CHECK (length(actor) BETWEEN 1 AND 128),
  decision text NOT NULL CHECK (decision IN ('accepted','rejected')),
  output_sha text NOT NULL CHECK (output_sha ~ '^[a-f0-9]{64}$'),
  evidence_sha text NOT NULL CHECK (evidence_sha ~ '^[a-f0-9]{64}$'),
  corpus_sha text CHECK (corpus_sha ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER quality_review_immutable BEFORE UPDATE OR DELETE ON quality_review
  FOR EACH ROW EXECUTE FUNCTION immutable_generation_evidence();
CREATE INDEX quality_review_job ON quality_review(job_id,created_at DESC,id DESC);
