-- Geometry is deterministic for the stored code; it is not an ffmpeg failure.
ALTER TABLE clip DROP CONSTRAINT clip_failure_reason_check;
ALTER TABLE clip ADD CONSTRAINT clip_failure_reason_check
  CHECK (failure_reason IN ('no_disk', 'ffmpeg_failed', 'ffmpeg_timeout', 'stale_attempt_result', 'watermark_geometry'));
