-- Схема N6 «Суфлёр»: 19 сущностей канона §4, логические поля — Pseudocode «Data Structures»,
-- отображение — Architecture «Data Architecture». Форма (uuid + created_at, text + CHECK для
-- перечислений, cidr-префикс вместо IP) — из N5: projects/05-podcast-clips-opus/packages/db/migrations/001_init.sql.
-- CHECK перечислений сверяет tests/enums.test.ts с единственным источником packages/rag/src/enums.ts.
-- Откат: восстановить резервную копию; down-миграции нет, миграции недели только добавляющие.

-- pgvector (ADR-001). Схема public явно: иначе расширение ляжет в первую схему search_path
-- (изолированная тестовая схема) и исчезнет вместе с ней, а тип vector станет невидим следующей.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'nobadge', 'studio')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'erasing', 'deleted')),
  partner_code_id uuid, erase_deadline timestamptz,
  CHECK (status <> 'erasing' OR erase_deadline IS NOT NULL)
);

-- IP хранится только префиксом (канон §7: IPv4 /24, IPv6 /48; 152-ФЗ).
CREATE TABLE session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ip_prefix cidr NOT NULL CONSTRAINT session_ip_prefix_only
    CHECK ((family(ip_prefix) = 4 AND masklen(ip_prefix) = 24) OR (family(ip_prefix) = 6 AND masklen(ip_prefix) = 48)),
  expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE INDEX session_account_active ON session (account_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE partner_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_-]{3,40}$'),
  owner_account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  "group" text NOT NULL CHECK ("group" ~ '^seed-[a-z0-9-]+$' OR "group" IN ('studio', 'partner')),
  frozen boolean NOT NULL DEFAULT false
);
ALTER TABLE account ADD CONSTRAINT account_partner_code_fk
  FOREIGN KEY (partner_code_id) REFERENCES partner_code(id) ON DELETE SET NULL;

CREATE TABLE bot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid REFERENCES account(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'deleted')),
  public_key text NOT NULL UNIQUE CHECK (public_key ~ '^[A-Za-z0-9_-]{22}$'),
  company_name text NOT NULL CHECK (length(company_name) BETWEEN 1 AND 200),
  contact text, greeting text NOT NULL DEFAULT '',
  public_slug text UNIQUE CHECK (public_slug ~ '^[a-z0-9-]{3,60}$'),
  public_enabled boolean NOT NULL DEFAULT false, public_indexable boolean NOT NULL DEFAULT false,
  studio_account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  brand jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(brand) = 'object'),
  -- у черновика предпросмотра владельца нет; у всех остальных он обязателен (Architecture «Reconciliation»)
  CONSTRAINT bot_owner_required CHECK (status = 'draft' OR account_id IS NOT NULL)
);
CREATE INDEX bot_account ON bot (account_id) WHERE status <> 'deleted';

CREATE TABLE allowed_origin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  origin text NOT NULL CHECK (origin ~ '^https?://[a-z0-9.-]+(:[0-9]{1,5})?$'),
  UNIQUE (bot_id, origin)
);

CREATE TABLE source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('site', 'pdf')),
  root_url text, file_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'ready', 'failed')),
  pages_indexed int NOT NULL DEFAULT 0 CHECK (pages_indexed >= 0),
  pages_skipped int NOT NULL DEFAULT 0 CHECK (pages_skipped >= 0),
  CHECK ((kind = 'site' AND root_url IS NOT NULL) OR (kind = 'pdf' AND file_name IS NOT NULL))
);
CREATE INDEX source_bot ON source (bot_id);

CREATE TABLE page (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  source_id uuid NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  url_or_page text NOT NULL, title text NOT NULL DEFAULT '',
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  skipped_reason text,
  -- «Повторить» продолжает по content_hash: одна страница источника — одна строка
  UNIQUE (source_id, url_or_page)
);

CREATE TABLE chunk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES page(id) ON DELETE CASCADE,
  ordinal int NOT NULL CHECK (ordinal >= 0),
  context_path text NOT NULL DEFAULT '', text text NOT NULL CHECK (length(text) > 0),
  token_count int NOT NULL CHECK (token_count BETWEEN 1 AND 600),
  embedding vector(1536) NOT NULL,
  UNIQUE (page_id, ordinal)
);
-- Поиск всегда с bot_id в ТОМ ЖЕ SQL (NFR-SEC-001); малые боты — точный перебор по этому индексу.
CREATE INDEX chunk_bot ON chunk (bot_id);
-- ADR-001: HNSW cosine, m = 16, ef_construction = 64; ef_search = 40 ставится SET LOCAL в поиске.
CREATE INDEX chunk_embedding_hnsw ON chunk USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE index_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  current_fence bigint NOT NULL DEFAULT 0 CHECK (current_fence >= 0),
  failure_reason text CHECK (failure_reason IN ('robots_disallowed', 'unreachable', 'blocked_address', 'no_text', 'not_pdf',
    'too_large', 'no_text_layer', 'quota_refused', 'embedding_unavailable', 'stalled', 'internal')),
  pages_total int CHECK (pages_total >= 0), pages_done int NOT NULL DEFAULT 0 CHECK (pages_done >= 0),
  chunks_done int NOT NULL DEFAULT 0 CHECK (chunks_done >= 0),
  page_budget int CHECK (page_budget > 0), embed_budget int CHECK (embed_budget > 0),
  embed_used int NOT NULL DEFAULT 0 CHECK (embed_used >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- причина есть ровно у отказа: «failed» без причины неотличим от молчания
  CONSTRAINT index_job_reason_iff_failed CHECK ((status = 'failed') = (failure_reason IS NOT NULL)),
  UNIQUE (bot_id, idempotency_key)
);
CREATE INDEX index_job_watchdog ON index_job (status, updated_at) WHERE status IN ('queued', 'running');

CREATE TABLE job_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  index_job_id uuid NOT NULL REFERENCES index_job(id) ON DELETE CASCADE,
  fence bigint NOT NULL CHECK (fence >= 1), series_no int NOT NULL CHECK (series_no >= 1),
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  UNIQUE (index_job_id, fence)
);

CREATE TABLE preview (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  browser_session text NOT NULL,
  ip_prefix cidr NOT NULL CHECK ((family(ip_prefix) = 4 AND masklen(ip_prefix) = 24) OR (family(ip_prefix) = 6 AND masklen(ip_prefix) = 48)),
  expires_at timestamptz NOT NULL, claimed_at timestamptz
);

CREATE TABLE visitor_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  ip_prefix cidr NOT NULL CHECK ((family(ip_prefix) = 4 AND masklen(ip_prefix) = 24) OR (family(ip_prefix) = 6 AND masklen(ip_prefix) = 48)),
  origin text NOT NULL
);

CREATE TABLE question_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  visitor_session_id uuid REFERENCES visitor_session(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('answered', 'unknown', 'refused_limit', 'refused_origin')),
  text text, text_expires_at timestamptz,
  cited_chunk_ids uuid[] NOT NULL DEFAULT '{}',
  -- 152-ФЗ: текст вопроса хранится только у «не знаю» и только со сроком (14 дней)
  CONSTRAINT question_text_only_unknown CHECK (outcome = 'unknown' OR text IS NULL),
  CONSTRAINT question_text_expires CHECK ((text IS NULL) = (text_expires_at IS NULL))
);
CREATE INDEX question_log_bot ON question_log (bot_id, created_at);

CREATE TABLE widget_install (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  origin text NOT NULL, first_config_at timestamptz NOT NULL DEFAULT now(), first_answer_at timestamptz,
  UNIQUE (bot_id, origin)
);

-- Предела здесь НЕТ: предел — окружение (14 переменных QUOTA_*), не колонка (ADR-008).
CREATE TABLE quota_counter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  scope text NOT NULL CHECK (scope IN ('visitor_answers', 'ip_answers', 'bot_day_answers', 'bot_month_answers', 'global_answers',
    'preview_session', 'ip_previews', 'global_previews', 'account_embed_tokens', 'global_embed_tokens')),
  scope_key text NOT NULL CHECK (length(scope_key) BETWEEN 1 AND 200),
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}(-[0-9]{2})?$'),
  used int NOT NULL DEFAULT 0 CHECK (used >= 0),
  -- scope с двумя пределами разводится по виду предела в ключе (A-N6-020): одно имя — одно число
  CONSTRAINT quota_preview_session_kind CHECK (scope <> 'preview_session' OR scope_key ~ ':(create|answers)$'),
  CONSTRAINT quota_global_previews_kind CHECK (scope <> 'global_previews' OR scope_key IN ('previews', 'preview_answers')),
  UNIQUE (scope, scope_key, period)
);

CREATE TABLE growth_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('badge_impression', 'badge_click', 'share_cta_shown', 'share_cta_click', 'widget_install',
    'first_answer', 'public_page_view', 'invite_sent', 'invite_accepted', 'interest')),
  bot_id uuid REFERENCES bot(id) ON DELETE SET NULL,
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  visitor_session_id uuid REFERENCES visitor_session(id) ON DELETE SET NULL,
  from_domain text, dedup_key text NOT NULL CHECK (length(dedup_key) BETWEEN 1 AND 300),
  UNIQUE (type, dedup_key)
);

CREATE TABLE attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL UNIQUE REFERENCES account(id) ON DELETE CASCADE,
  partner_code_id uuid NOT NULL REFERENCES partner_code(id),
  source text NOT NULL CHECK (source IN ('code', 'invite', 'cookie')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'rejected')),
  reject_reason text,
  CHECK (status = 'rejected' OR reject_reason IS NULL)
);

CREATE TABLE studio_invite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  studio_account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  email text NOT NULL, expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES account(id) ON DELETE SET NULL, accepted_at timestamptz,
  CHECK ((accepted_by IS NULL) = (accepted_at IS NULL))
);

CREATE TABLE pro_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  plan_wanted text NOT NULL CHECK (plan_wanted IN ('nobadge', 'studio')),
  origin_screen text NOT NULL
);
