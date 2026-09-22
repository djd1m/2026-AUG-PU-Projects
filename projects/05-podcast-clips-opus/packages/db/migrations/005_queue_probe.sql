-- Fence is allocated while holding the video row lock, across all stages/series.
ALTER TABLE video ADD COLUMN fence int NOT NULL DEFAULT 0 CHECK (fence >= 0);
UPDATE video v SET fence = COALESCE((SELECT max(a.fence) FROM job_attempt a WHERE a.video_id=v.id), 0);
CREATE INDEX job_attempt_open ON job_attempt (video_id, stage, series_no)
  WHERE status IN ('running', 'deferred');
-- No changes to applied migrations. Rollback requires stopping queue consumers first.
