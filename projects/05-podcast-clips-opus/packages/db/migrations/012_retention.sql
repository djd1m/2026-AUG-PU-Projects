-- Additive: applied migrations and growth_event SET NULL foreign keys stay intact.
CREATE INDEX video_refused_upload_retention ON video (created_at)
  WHERE status='failed' AND failure_reason='refused_user_uploads';
CREATE INDEX account_erasure_pending ON account (updated_at, id) WHERE status='erasing';
CREATE INDEX guest_pack_expiration ON guest_pack (expires_at) WHERE revoked_at IS NULL;
