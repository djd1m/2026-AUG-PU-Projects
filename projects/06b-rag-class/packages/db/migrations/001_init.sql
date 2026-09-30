-- 001_init.sql — 16 сущностей docs/Pseudocode.md → Data Structures, физика — docs/Architecture.md → Data Architecture.
-- Закрытые множества в CHECK совпадают с packages/db/src/enums.ts (страж enums-vs-migrations.test.ts).
-- account_id денормализован в дочерних таблицах, чтобы RLS (002_rls.sql) держалась одним предикатом.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE account (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text,
  password_hash      text,
  kind               text NOT NULL DEFAULT 'owner' CONSTRAINT account_kind_check CHECK (kind IN ('owner', 'studio')),
  plan               text NOT NULL DEFAULT 'free', -- без CHECK намеренно: толкование planOf() в коде, неопознанное = free (ADR-006)
  badge_removal      text NOT NULL DEFAULT 'none' CONSTRAINT account_badge_removal_check CHECK (badge_removal IN ('none', 'active')),
  parent_account_id  uuid REFERENCES account(id),
  studio_access      boolean NOT NULL DEFAULT false,
  is_test            boolean NOT NULL DEFAULT false,
  referred_by_bot_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_email_lower CHECK (email IS NULL OR email = lower(email)),
  CONSTRAINT account_no_self_parent CHECK (parent_account_id IS NULL OR parent_account_id <> id)
);
CREATE UNIQUE INDEX account_email_key ON account (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX account_parent_idx ON account (parent_account_id) WHERE parent_account_id IS NOT NULL;

-- Подаккаунт студии: один уровень (перенос N2 #11). Родитель — студия без родителя; у аккаунта с детьми родителя нет.
CREATE FUNCTION account_one_level() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_account_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM account p WHERE p.id = NEW.parent_account_id
                   AND p.kind = 'studio' AND p.parent_account_id IS NULL) THEN
      RAISE EXCEPTION 'родитель подаккаунта должен быть студией верхнего уровня' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM account c WHERE c.parent_account_id = NEW.id) THEN
      RAISE EXCEPTION 'аккаунт с подаккаунтами не может стать подаккаунтом' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_one_level_trg BEFORE INSERT OR UPDATE OF parent_account_id ON account
  FOR EACH ROW EXECUTE FUNCTION account_one_level();

CREATE TABLE session (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_token_hash_key UNIQUE (token_hash)
);
CREATE INDEX session_expires_idx ON session (expires_at);

CREATE TABLE bot (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES account(id),
  public_id             text NOT NULL CONSTRAINT bot_public_id_format CHECK (public_id ~ '^[A-Za-z0-9_-]{12}$'),
  name                  text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  contact               text,
  published             boolean NOT NULL DEFAULT false,
  demo_enabled          boolean NOT NULL DEFAULT false,
  demo_slug             text,
  allowed_origins       text[] NOT NULL DEFAULT '{}', -- пустой массив = закрыто (ADR-007)
  first_cited_answer_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_public_id_key UNIQUE (public_id),
  CONSTRAINT bot_demo_slug_key UNIQUE (demo_slug),
  CONSTRAINT bot_published_needs_contact CHECK (NOT published OR (contact IS NOT NULL AND contact <> ''))
);
CREATE INDEX bot_account_idx ON bot (account_id);
ALTER TABLE account ADD CONSTRAINT account_referred_by_bot_fk FOREIGN KEY (referred_by_bot_id) REFERENCES bot(id);

CREATE TABLE source (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      uuid NOT NULL REFERENCES bot(id),
  account_id  uuid NOT NULL REFERENCES account(id),
  kind        text NOT NULL CONSTRAINT source_kind_check CHECK (kind IN ('site', 'pdf')),
  url         text,
  file_name   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_locator CHECK ((kind = 'site' AND url IS NOT NULL) OR (kind = 'pdf' AND file_name IS NOT NULL))
);
CREATE INDEX source_bot_idx ON source (bot_id);

CREATE TABLE source_file (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES source(id),
  account_id  uuid NOT NULL REFERENCES account(id), -- денормализация для RLS (Architecture: SourceFile по account_id)
  bytes       bytea NOT NULL CONSTRAINT source_file_size CHECK (octet_length(bytes) <= 10485760),
  sha256      text NOT NULL,
  pages       integer CHECK (pages IS NULL OR pages >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_file_source_idx ON source_file (source_id);

CREATE TABLE document (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL REFERENCES source(id),
  account_id      uuid NOT NULL REFERENCES account(id),
  locator_url     text,
  locator_page    integer CHECK (locator_page IS NULL OR locator_page >= 1),
  title           text NOT NULL,
  text            text NOT NULL,
  content_sha256  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_locator CHECK (locator_url IS NOT NULL OR locator_page IS NOT NULL),
  CONSTRAINT document_source_url_key UNIQUE (source_id, locator_url),
  CONSTRAINT document_source_page_key UNIQUE (source_id, locator_page)
);

CREATE TABLE chunk (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES document(id),
  bot_id       uuid NOT NULL REFERENCES bot(id),
  account_id   uuid NOT NULL REFERENCES account(id),
  ord          integer NOT NULL CHECK (ord >= 0),
  text         text NOT NULL,
  text_sha256  text NOT NULL,
  tokens       integer NOT NULL CHECK (tokens > 0),
  embedding    vector(1536) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chunk_document_text_key UNIQUE (document_id, text_sha256)
);
CREATE INDEX chunk_bot_idx ON chunk (bot_id);
CREATE INDEX chunk_embedding_hnsw ON chunk USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE index_job (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL REFERENCES source(id),
  account_id      uuid NOT NULL REFERENCES account(id),
  state           text NOT NULL DEFAULT 'queued'
                  CONSTRAINT index_job_state_check CHECK (state IN ('queued', 'running', 'succeeded', 'failed')),
  progress_done   integer NOT NULL DEFAULT 0 CHECK (progress_done >= 0),
  progress_total  integer CHECK (progress_total IS NULL OR progress_total >= 0),
  error           text,
  note            text,
  attempts        integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  leased_until    timestamptz,
  lease_fence     integer NOT NULL DEFAULT 0,
  run_started_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);
-- Идемпотентный ключ: одна живая задача на источник (long-running-job.md).
CREATE UNIQUE INDEX index_job_live_source_key ON index_job (source_id) WHERE state IN ('queued', 'running');
CREATE INDEX index_job_queue_idx ON index_job (state, leased_until) WHERE state IN ('queued', 'running');

CREATE TABLE question_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id           uuid NOT NULL REFERENCES bot(id),
  account_id       uuid NOT NULL REFERENCES account(id),
  channel          text NOT NULL CONSTRAINT question_log_channel_check CHECK (channel IN ('sandbox', 'widget', 'demo')),
  visitor_key      text,
  origin_host      text,
  question         text NOT NULL CHECK (length(question) <= 500),
  outcome          text NOT NULL CONSTRAINT question_log_outcome_check
                   CHECK (outcome IN ('answered', 'below_threshold', 'model_unknown', 'invalid_citation', 'limited', 'error')),
  cited_chunk_ids  uuid[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX question_log_created_idx ON question_log (created_at);
CREATE INDEX question_log_bot_idx ON question_log (bot_id, created_at);

CREATE TABLE model_call_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CONSTRAINT model_call_log_kind_check CHECK (kind IN ('embed_index', 'embed_question', 'answer')),
  account_id  uuid REFERENCES account(id),
  bot_id      uuid REFERENCES bot(id),
  state       text NOT NULL CONSTRAINT model_call_log_state_check CHECK (state IN ('started', 'succeeded', 'failed')),
  tokens_in   integer CHECK (tokens_in IS NULL OR tokens_in >= 0),
  tokens_out  integer CHECK (tokens_out IS NULL OR tokens_out >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_call_log_kind_created_idx ON model_call_log (kind, created_at);

-- Квоты: одна инструкция на ключ (N4 #14) — INSERT … ON CONFLICT DO UPDATE … WHERE used + n <= limit RETURNING.
CREATE TABLE quota_counter (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (length(scope) BETWEEN 1 AND 300),
  day         date NOT NULL,
  used        integer NOT NULL CHECK (used >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quota_counter_scope_day_key UNIQUE (scope, day)
);

CREATE TABLE widget_install (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id             uuid NOT NULL REFERENCES bot(id),
  origin_host        text NOT NULL,
  page_url           text NOT NULL,
  config_seen_at     timestamptz NOT NULL,
  first_question_at  timestamptz,
  page_verified_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT widget_install_bot_host_key UNIQUE (bot_id, origin_host)
);

CREATE TABLE badge_event (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id       uuid NOT NULL REFERENCES bot(id),
  kind         text NOT NULL CONSTRAINT badge_event_kind_check CHECK (kind IN ('impression', 'click', 'tamper')),
  visitor_key  text,
  day          date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Клик уникален за сутки на посетителя (FR-n6b-11).
CREATE UNIQUE INDEX badge_event_click_key ON badge_event (bot_id, kind, visitor_key, day) WHERE kind = 'click';

CREATE TABLE growth_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES account(id),
  kind        text NOT NULL CONSTRAINT growth_event_kind_check CHECK (kind IN ('first_cited_answer', 'badge_removal_intent')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE handover_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES account(id),
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handover_token_hash_key UNIQUE (token_hash)
);

-- Пустая таблица = доступа к /admin нет ни у кого. Запись — только миграцией или CLI оператора.
CREATE TABLE operator (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES account(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_account_key UNIQUE (account_id)
);
