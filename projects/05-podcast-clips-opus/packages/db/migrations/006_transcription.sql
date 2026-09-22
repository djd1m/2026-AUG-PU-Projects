-- Durable per-chunk dispatch counts prevent free replay after worker crashes.
ALTER TABLE job_attempt ADD COLUMN stt_calls jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(stt_calls) = 'object');
ALTER TABLE transcript ADD COLUMN fence int NOT NULL DEFAULT 0 CHECK (fence >= 0);
-- Existing video/job closed enums already come from shared/enums.ts and are
-- checked by tests/enums.test.ts; transcription introduces no new enum values.
