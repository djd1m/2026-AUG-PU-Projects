ALTER TABLE clip ADD COLUMN music_track_id text CHECK (music_track_id IS NULL OR char_length(music_track_id) BETWEEN 1 AND 64);
ALTER TABLE clip ADD COLUMN rendered_music_track_id text;
ALTER TABLE clip ADD COLUMN render_version integer NOT NULL DEFAULT 1 CHECK (render_version >= 1);
ALTER TABLE job_attempt ADD COLUMN rerender boolean NOT NULL DEFAULT false;
ALTER TABLE quota_counter DROP CONSTRAINT quota_counter_scope_check;
ALTER TABLE quota_counter ADD CONSTRAINT quota_counter_scope_check CHECK (scope IN ('user_minutes','user_uploads','user_upload_refunds','user_llm','global_minutes','global_llm','user_rerenders'));
