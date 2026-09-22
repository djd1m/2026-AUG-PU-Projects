-- Откат: восстановить резервную копию либо удалить отдельную пустую тестовую схему; down-миграции нет.
-- CHECK перечислений сверяет tests/enums.test.ts с единственным источником packages/shared/src/enums.ts.
CREATE TABLE account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL UNIQUE, password_hash text NOT NULL, telegram_user_id text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'paid')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'erasing', 'deleted')),
  deletion_requested_at timestamptz, erase_deadline timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX account_telegram_unique ON account (telegram_user_id) WHERE telegram_user_id IS NOT NULL;

CREATE TABLE session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES account(id), cookie_token_hash text NOT NULL UNIQUE,
  ip_prefix cidr NOT NULL CHECK (masklen(ip_prefix) = 24), expires_at timestamptz NOT NULL,
  revoked_at timestamptz, last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_account_active ON session (account_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE video (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES account(id), idempotency_key text NOT NULL,
  source text NOT NULL CHECK (source IN ('upload', 'url')), source_url text, object_key text, upload_id text,
  declared_bytes bigint NOT NULL CHECK (declared_bytes > 0), actual_bytes bigint CHECK (actual_bytes >= 0),
  duration_seconds numeric(10,1) CHECK (duration_seconds >= 0), minutes_charged int CHECK (minutes_charged >= 0),
  status text NOT NULL CHECK (status IN ('uploading', 'queued', 'transcribing', 'selecting', 'rendering', 'done', 'failed')),
  failure_reason text CHECK (failure_reason IN ('too_large', 'not_media', 'no_audio', 'too_short', 'too_long', 'probe_timeout', 'stt_failed', 'no_timestamps', 'no_fragments', 'schema_violation', 'refused_user_uploads', 'refused_user_minutes', 'refused_global_minutes', 'refused_user_llm', 'refused_global_llm', 'stalled', 'render_failed')),
  stage_progress int CHECK (stage_progress BETWEEN 0 AND 100),
  clips_total int CHECK (clips_total >= 0), clips_done int CHECK (clips_done >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, deleted_at timestamptz,
  UNIQUE (account_id, idempotency_key)
);
CREATE INDEX video_watchdog ON video (status, updated_at)
  WHERE status IN ('queued', 'transcribing', 'selecting', 'rendering') AND deleted_at IS NULL;
CREATE INDEX video_account_live ON video (account_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE transcript (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  video_id uuid NOT NULL UNIQUE REFERENCES video(id), language text NOT NULL,
  duration_seconds numeric(10,1) NOT NULL CHECK (duration_seconds >= 0),
  chunk_count int NOT NULL CHECK (chunk_count > 0), words jsonb NOT NULL, segments jsonb NOT NULL,
  CHECK (jsonb_typeof(words) = 'array'), CHECK (jsonb_typeof(segments) = 'array')
);

CREATE TABLE clip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  video_id uuid NOT NULL REFERENCES video(id), "index" int NOT NULL CHECK ("index" > 0),
  start_seconds numeric(10,1) NOT NULL CHECK (start_seconds >= 0),
  end_seconds numeric(10,1) NOT NULL CHECK (end_seconds > start_seconds), title text NOT NULL,
  score int CHECK (score BETWEEN 0 AND 99),
  score_hook int CHECK (score_hook BETWEEN 0 AND 33),
  score_completeness int CHECK (score_completeness BETWEEN 0 AND 33),
  score_length int CHECK (score_length BETWEEN 0 AND 33),
  explain_hook text, explain_completeness text, explain_length text,
  status text NOT NULL CHECK (status IN ('queued', 'rendering', 'done', 'failed')),
  watermarked boolean NOT NULL, render_fence int NOT NULL DEFAULT 0 CHECK (render_fence >= 0),
  object_key text, thumbnail_key text, bytes bigint CHECK (bytes >= 0), expires_at timestamptz,
  failure_reason text CHECK (failure_reason IN ('no_disk', 'ffmpeg_failed', 'ffmpeg_timeout', 'stale_attempt_result')),
  CHECK (score IS NULL OR (explain_hook <> '' AND explain_completeness <> '' AND explain_length <> '')),
  -- SQL CHECK пропускает UNKNOWN: отдельно закрываем NULL и пробельные объяснения.
  CHECK (score IS NULL OR (explain_hook IS NOT NULL AND explain_completeness IS NOT NULL AND explain_length IS NOT NULL
    AND btrim(explain_hook) <> '' AND btrim(explain_completeness) <> '' AND btrim(explain_length) <> '')),
  CHECK (score IS NULL OR (score_hook IS NOT NULL AND score_completeness IS NOT NULL AND score_length IS NOT NULL
    AND score = score_hook + score_completeness + score_length))
);
CREATE INDEX clip_video_order ON clip (video_id, "index");

CREATE TABLE clip_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  clip_id uuid NOT NULL UNIQUE REFERENCES clip(id), code text NOT NULL UNIQUE,
  unique_view_count int NOT NULL DEFAULT 0 CHECK (unique_view_count >= 0), last_view_at timestamptz
);

CREATE TABLE partner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL UNIQUE REFERENCES account(id), display_name text NOT NULL, contact text
);
CREATE TABLE partner_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  partner_id uuid NOT NULL REFERENCES partner(id), code text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 6 AND 12),
  status text NOT NULL CHECK (status IN ('active', 'blocked')),
  blocked_reason text CHECK (blocked_reason IN ('antifraud_ip_burst', 'manual')), blocked_at timestamptz
);

CREATE TABLE guest_pack (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  video_id uuid NOT NULL REFERENCES video(id), account_id uuid NOT NULL REFERENCES account(id),
  code text NOT NULL UNIQUE, guest_name text NOT NULL,
  consent_confirmed boolean NOT NULL CHECK (consent_confirmed = true),
  consent_version text NOT NULL CHECK (consent_version <> ''),
  consent_text_hash text NOT NULL CHECK (consent_text_hash <> ''), consent_at timestamptz NOT NULL,
  host_partner_code_id uuid NOT NULL REFERENCES partner_code(id),
  expires_at timestamptz, sent_at timestamptz, first_opened_at timestamptz, revoked_at timestamptz,
  CHECK ((sent_at IS NULL AND expires_at IS NULL) OR
    (sent_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at = sent_at + interval '336 hours'))
);
CREATE TABLE guest_pack_clip (
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  guest_pack_id uuid NOT NULL REFERENCES guest_pack(id), clip_id uuid NOT NULL REFERENCES clip(id),
  PRIMARY KEY (guest_pack_id, clip_id)
);

CREATE TABLE growth_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('download', 'link_copy', 'link_view', 'guest_sent', 'guest_opened', 'guest_registered', 'code_applied', 'interest')),
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  video_id uuid REFERENCES video(id) ON DELETE SET NULL,
  clip_id uuid REFERENCES clip(id) ON DELETE SET NULL,
  clip_link_id uuid REFERENCES clip_link(id) ON DELETE SET NULL,
  guest_pack_id uuid REFERENCES guest_pack(id) ON DELETE SET NULL,
  partner_code_id uuid REFERENCES partner_code(id) ON DELETE SET NULL,
  ip_prefix cidr CHECK (masklen(ip_prefix) = 24), day date NOT NULL,
  source_screen text CHECK (source_screen IN ('clip_card', 'guest_page', 'partner_dashboard'))
);
CREATE INDEX growth_event_type_created ON growth_event (type, created_at);
CREATE UNIQUE INDEX growth_event_link_view_unique ON growth_event (clip_link_id, ip_prefix, day) WHERE type = 'link_view';
CREATE UNIQUE INDEX growth_event_guest_opened_unique ON growth_event (guest_pack_id, ip_prefix, day) WHERE type = 'guest_opened';

CREATE TABLE attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL UNIQUE REFERENCES account(id), partner_code_id uuid NOT NULL REFERENCES partner_code(id),
  source text NOT NULL CHECK (source IN ('explicit', 'guest_link', 'cookie')),
  status text NOT NULL CHECK (status IN ('pending', 'activated', 'rejected')),
  replaced_source text CHECK (replaced_source IN ('explicit', 'guest_link', 'cookie')),
  reject_reason text CHECK (reject_reason IN ('self_referral', 'code_blocked', 'antifraud_ip_burst')),
  activated_at timestamptz
);
CREATE TABLE quota_counter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  scope text NOT NULL CHECK (scope IN ('user_minutes', 'user_uploads', 'user_upload_refunds', 'user_llm', 'global_minutes', 'global_llm')),
  scope_key text NOT NULL, day date NOT NULL, used int NOT NULL DEFAULT 0 CHECK (used >= 0),
  UNIQUE (scope, scope_key, day)
);
CREATE TABLE pro_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL UNIQUE REFERENCES account(id), contact text NOT NULL,
  source_screen text NOT NULL CHECK (source_screen IN ('clip_card', 'guest_page', 'partner_dashboard')),
  last_pressed_at timestamptz NOT NULL
);
CREATE TABLE job_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  video_id uuid NOT NULL REFERENCES video(id),
  stage text NOT NULL CHECK (stage IN ('stt', 'select', 'render')),
  clip_id uuid NULL REFERENCES clip(id), series_no int NOT NULL DEFAULT 1 CHECK (series_no > 0),
  attempt_no int NOT NULL CHECK (attempt_no > 0), fence int NOT NULL CHECK (fence > 0),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'deferred')),
  wait_reason text NULL CHECK (wait_reason IN ('no_disk')),
  unit text NOT NULL CHECK (unit IN ('minutes', 'calls', 'none')), unit_count int NOT NULL CHECK (unit_count >= 0),
  provider text, model text, failure_reason text, started_at timestamptz NOT NULL, finished_at timestamptz,
  UNIQUE (video_id, fence)
);
