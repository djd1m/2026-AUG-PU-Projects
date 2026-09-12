-- N4 «Тарелка» — схема на ВСЕ 14 сущностей канона §4 (FR-foundation-3).
--
-- Источник физики — docs/Architecture.md (Data Architecture); источник логических полей и
-- закрытых наборов — docs/Pseudocode.md (Data Structures). Здесь ничего не изобретается.
--
-- Роли (n4_migrate — владелец схемы, n4_app — DML без права менять схему) создаются
-- бутстрапом кластера scripts/init-foundation-db.sh: роль — объект КЛАСТЕРА, а её пароль
-- не имеет права лежать в файле, который коммитится. Эта миграция выдаёт роли n4_app
-- права на созданные ниже объекты и назначает ALTER DEFAULT PRIVILEGES, чтобы таблица
-- следующей миграции была видна приложению сразу, а не после ручной правки грантов.

-- Расширение нечёткого поиска по названию продукта (ADR-006). pg_trgm — доверенное
-- расширение, поэтому его ставит владелец схемы, а не суперпользователь.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Закрытые перечисления. Каждое — ровно столько значений, сколько в каноне ───────────
CREATE TYPE account_status          AS ENUM ('active', 'erasing', 'erased');
CREATE TYPE photo_file_state        AS ENUM ('present', 'purged');
CREATE TYPE recognition_status      AS ENUM ('queued', 'done', 'failed', 'refused');
CREATE TYPE recognition_failure_reason AS ENUM (
  'provider_unavailable', 'provider_timeout', 'schema_violation',
  'no_food_detected', 'no_food_matched',
  'quota_exhausted_user', 'quota_exhausted_global', 'quota_exhausted_escalation');
CREATE TYPE meal_slot               AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
CREATE TYPE partner_status          AS ENUM ('active', 'suspended');
CREATE TYPE partner_code_status     AS ENUM ('active', 'blocked');
CREATE TYPE partner_code_block_reason AS ENUM ('antifraud_ip_burst', 'manual');
CREATE TYPE attribution_status      AS ENUM ('pending', 'activated', 'rejected');
CREATE TYPE attribution_source      AS ENUM ('explicit', 'deeplink', 'cookie');
CREATE TYPE attribution_reject_reason AS ENUM ('self_referral', 'code_blocked', 'antifraud_ip_burst');
CREATE TYPE quota_scope             AS ENUM ('user', 'global', 'escalation');
CREATE TYPE growth_event_type       AS ENUM ('install', 'activation', 'share_click', 'card_view', 'code_applied');
CREATE TYPE pro_interest_contact_kind  AS ENUM ('email', 'telegram');
CREATE TYPE pro_interest_source_screen AS ENUM ('user_limit', 'global_limit');

-- ─── 1. account ────────────────────────────────────────────────────────────────────────
-- Появляется только после входа через Telegram. `status` выразим в состоянии «удаляется»:
-- удаление по запросу длится до 72 часов, и всё это время строка обязана существовать,
-- иначе повторный запрос не отличить от выполненного.
CREATE TABLE account (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  telegram_user_id      text        NOT NULL,
  tier                  text        NOT NULL DEFAULT 'free',
  consent_version       text,
  consent_text_hash     text,
  consent_at            timestamptz,
  deletion_requested_at timestamptz,
  status                account_status NOT NULL DEFAULT 'active',
  CONSTRAINT account_telegram_user_id_unique UNIQUE (telegram_user_id)
);

-- ─── 2. device_session ─────────────────────────────────────────────────────────────────
-- Хранится ХЭШ токена cookie, а не токен: утечка дампа не должна выдавать действующие
-- сессии. Адрес хранится УСЕЧЁННЫМ префиксом — полного адреса нет нигде.
CREATE TABLE device_session (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  account_id                 uuid REFERENCES account(id) ON DELETE SET NULL,
  cookie_token_hash          text        NOT NULL,
  ip_prefix                  text        NOT NULL,
  last_seen_at               timestamptz NOT NULL DEFAULT now(),
  anonymous_diary_expires_at timestamptz NOT NULL,
  CONSTRAINT device_session_cookie_token_hash_unique UNIQUE (cookie_token_hash)
);
CREATE INDEX device_session_anonymous_expiry_idx ON device_session (anonymous_diary_expires_at);

-- ─── 3. photo ──────────────────────────────────────────────────────────────────────────
-- Байты — в приватном бакете; здесь только ключ объекта и метаданные. Строка после уборки
-- СОХРАНЯЕТСЯ в состоянии `purged`: удаление строки оставило бы дневник со ссылкой на
-- пустоту. Частичный индекс по `expires_on` — без него суточная уборка читает всю таблицу.
CREATE TABLE photo (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  device_session_id     uuid        NOT NULL REFERENCES device_session(id) ON DELETE CASCADE,
  object_key            text        NOT NULL,
  mime                  text        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  bytes                 integer     NOT NULL CHECK (bytes > 0),
  width                 integer     NOT NULL CHECK (width > 0),
  height                integer     NOT NULL CHECK (height > 0),
  normalized_object_key text,
  normalized_bytes      integer CHECK (normalized_bytes IS NULL OR normalized_bytes > 0),
  expires_on            date        NOT NULL,
  file_state            photo_file_state NOT NULL DEFAULT 'present',
  CONSTRAINT photo_object_key_unique UNIQUE (object_key)
);
CREATE INDEX photo_expiry_present_idx ON photo (expires_on) WHERE file_state = 'present';

-- ─── 4. recognition ────────────────────────────────────────────────────────────────────
-- И запись результата, И строка очереди; второго места истины нет.
-- `leased_until` входит в предикат выборки И в индекс: после закрытия транзакции аренды
-- SKIP LOCKED не защищает ничего, и только срок аренды разделяет воркеров.
-- `lease_fence` монотонно растёт; запись результата условна по нему (ADR-003, DEC-A-008).
CREATE TABLE recognition (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  device_session_id   uuid        NOT NULL REFERENCES device_session(id) ON DELETE CASCADE,
  account_id          uuid REFERENCES account(id) ON DELETE SET NULL,
  photo_id            uuid REFERENCES photo(id) ON DELETE SET NULL,
  status              recognition_status NOT NULL DEFAULT 'queued',
  attempt_no          integer     NOT NULL DEFAULT 1 CHECK (attempt_no > 0),
  model_used          text CHECK (model_used IS NULL OR model_used IN ('haiku-4.5', 'sonnet-5')),
  escalated           boolean     NOT NULL DEFAULT false,
  confidence          real CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  items               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  model_estimate_kcal integer CHECK (model_estimate_kcal IS NULL OR model_estimate_kcal >= 0),
  db_kcal_total       integer CHECK (db_kcal_total IS NULL OR db_kcal_total >= 0),
  discrepancy_ratio   real,
  conflict_flag       boolean     NOT NULL DEFAULT false,
  failure_reason      recognition_failure_reason,
  idempotency_key     text,
  leased_until        timestamptz,
  lease_owner         uuid,
  lease_fence         integer     NOT NULL DEFAULT 0,
  finished_at         timestamptz,
  CONSTRAINT recognition_idempotency_unique UNIQUE (device_session_id, idempotency_key)
);
CREATE INDEX recognition_queue_idx ON recognition (status, leased_until) WHERE status = 'queued';

-- ─── 5. food_item ──────────────────────────────────────────────────────────────────────
CREATE TABLE food_item (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  source               text        NOT NULL DEFAULT 'USDA-FDC',
  source_id            text        NOT NULL,
  name_en              text        NOT NULL,
  kcal_per_100g        integer     NOT NULL CHECK (kcal_per_100g >= 0),
  protein_per_100g     numeric(6,1) NOT NULL CHECK (protein_per_100g >= 0),
  fat_per_100g         numeric(6,1) NOT NULL CHECK (fat_per_100g >= 0),
  carb_per_100g        numeric(6,1) NOT NULL CHECK (carb_per_100g >= 0),
  default_portion_g    integer CHECK (default_portion_g IS NULL OR default_portion_g > 0),
  import_snapshot_date date        NOT NULL,
  CONSTRAINT food_item_source_unique UNIQUE (source, source_id)
);
CREATE INDEX food_item_name_en_trgm_idx ON food_item USING gin (name_en gin_trgm_ops);

-- ─── 6. food_synonym ───────────────────────────────────────────────────────────────────
-- Ровно ОДНО из `food_item_id` и `recipe_parts` заполнено: без строгого ИЛИ запись с
-- обоими пустыми полями читалась бы как пустая молча. Индекс триграмм — по
-- НОРМАЛИЗОВАННОЙ форме, потому что поиск идёт по ней.
CREATE TABLE food_synonym (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  name_ru            text        NOT NULL,
  name_ru_normalized text        NOT NULL,
  food_item_id       uuid REFERENCES food_item(id) ON DELETE RESTRICT,
  recipe_parts       jsonb,
  curated_by         text        NOT NULL,
  curated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_synonym_exactly_one_form CHECK (
    (food_item_id IS NOT NULL AND recipe_parts IS NULL)
    OR (food_item_id IS NULL AND recipe_parts IS NOT NULL)
  )
);
CREATE INDEX food_synonym_normalized_trgm_idx ON food_synonym USING gin (name_ru_normalized gin_trgm_ops);

-- ─── 7. diary_entry ────────────────────────────────────────────────────────────────────
-- Дата — календарная (`date` в Europe/Moscow), а не момент времени: ужин в 23:50 по Москве
-- не должен попасть во вчера у сервера в UTC. Удаление мягкое, поэтому индекс частичный.
CREATE TABLE diary_entry (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  owner_key       text        NOT NULL,
  recognition_id  uuid        NOT NULL REFERENCES recognition(id) ON DELETE RESTRICT,
  eaten_on        date        NOT NULL,
  meal_slot       meal_slot   NOT NULL,
  items           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  kcal_total      integer     NOT NULL CHECK (kcal_total >= 0),
  protein_total   numeric(6,1) NOT NULL CHECK (protein_total >= 0),
  fat_total       numeric(6,1) NOT NULL CHECK (fat_total >= 0),
  carb_total      numeric(6,1) NOT NULL CHECK (carb_total >= 0),
  source_snapshot jsonb       NOT NULL,
  user_corrected  boolean     NOT NULL DEFAULT false,
  deleted_at      timestamptz
);
CREATE INDEX diary_entry_owner_day_idx ON diary_entry (owner_key, eaten_on) WHERE deleted_at IS NULL;

-- ─── 8. share_card ─────────────────────────────────────────────────────────────────────
-- `id` — публичный неугадываемый адрес `/c/{card_id}`. `revoked_at` обязателен: отзыв
-- согласия закрывает уже опубликованную карточку за 60 секунд.
CREATE TABLE share_card (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  owner_key      text        NOT NULL,
  recognition_id uuid        NOT NULL REFERENCES recognition(id) ON DELETE RESTRICT,
  object_key     text        NOT NULL,
  width          integer     NOT NULL DEFAULT 1080 CHECK (width = 1080),
  height         integer     NOT NULL DEFAULT 1920 CHECK (height = 1920),
  badge_rendered boolean     NOT NULL DEFAULT false,
  revoked_at     timestamptz
);
CREATE INDEX share_card_owner_idx ON share_card (owner_key, created_at);

-- ─── 9. partner ────────────────────────────────────────────────────────────────────────
CREATE TABLE partner (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  display_name text        NOT NULL,
  contact      text        NOT NULL,
  account_id   uuid REFERENCES account(id) ON DELETE SET NULL,
  status       partner_status NOT NULL DEFAULT 'active'
);

-- ─── 10. partner_code ──────────────────────────────────────────────────────────────────
-- `UNIQUE (code)` в верхнем регистре — иначе два партнёра получают один код.
CREATE TABLE partner_code (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  partner_id     uuid        NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  code           text        NOT NULL CHECK (code ~ '^[A-Z0-9]{4,12}$'),
  status         partner_code_status NOT NULL DEFAULT 'active',
  blocked_reason partner_code_block_reason,
  blocked_at     timestamptz,
  CONSTRAINT partner_code_code_unique UNIQUE (code)
);

-- ─── 11. attribution ───────────────────────────────────────────────────────────────────
-- `UNIQUE (device_session_id)` гарантирует ЕДИНСТВЕННОСТЬ строки, но НЕ её неизменность:
-- правило приоритета explicit > deeplink > cookie живёт в коде, и `replaced_source`
-- оставляет след замены слабого источника явным кодом.
CREATE TABLE attribution (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  device_session_id uuid        NOT NULL REFERENCES device_session(id) ON DELETE CASCADE,
  partner_code_id   uuid        NOT NULL REFERENCES partner_code(id) ON DELETE RESTRICT,
  status            attribution_status NOT NULL DEFAULT 'pending',
  reject_reason     attribution_reject_reason,
  source            attribution_source NOT NULL,
  replaced_source   attribution_source,
  activated_at      timestamptz,
  CONSTRAINT attribution_device_session_unique UNIQUE (device_session_id)
);

-- ─── 12. scan_quota_counter ────────────────────────────────────────────────────────────
-- Потолок обеспечивает БАЗА: `UNIQUE (scope, scope_key, day)` плюс условие в UPDATE.
-- Третье значение `escalation` — не украшение перечисления: без своей строки потолок 600
-- не с чем сравнить (ADR-007). Колонка "limit" в кавычках: имя взято из канона дословно.
CREATE TABLE scan_quota_counter (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  scope      quota_scope NOT NULL,
  scope_key  text        NOT NULL,
  day        date        NOT NULL,
  used       integer     NOT NULL DEFAULT 0 CHECK (used >= 0),
  "limit"    integer     NOT NULL CHECK ("limit" > 0),
  CONSTRAINT scan_quota_counter_key_unique UNIQUE (scope, scope_key, day)
);

-- ─── 13. pro_interest ──────────────────────────────────────────────────────────────────
-- Отдельная таблица, а не колонка в `account`: интерес оставляет и аноним.
CREATE TABLE pro_interest (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  owner_key       text        NOT NULL,
  contact         text        NOT NULL,
  contact_kind    pro_interest_contact_kind  NOT NULL,
  source_screen   pro_interest_source_screen NOT NULL,
  partner_code_id uuid REFERENCES partner_code(id) ON DELETE SET NULL
);
CREATE INDEX pro_interest_created_idx ON pro_interest (created_at);

-- ─── 14. growth_event ──────────────────────────────────────────────────────────────────
-- Единственный источник истины для счётчиков кабинета партнёра и метрики недели:
-- существование `share_card` доказывает, что карточка СОБРАНА, и не доказывает шеринга.
CREATE TABLE growth_event (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  type              growth_event_type NOT NULL,
  device_session_id uuid        NOT NULL REFERENCES device_session(id) ON DELETE CASCADE,
  partner_code_id   uuid REFERENCES partner_code(id) ON DELETE SET NULL,
  share_card_id     uuid REFERENCES share_card(id) ON DELETE SET NULL
);
CREATE INDEX growth_event_partner_idx ON growth_event (partner_code_id, type, created_at);

-- ─── Права приложения: DML — да, DDL — нет ─────────────────────────────────────────────
-- Компрометация приложения не даёт права переписать схему. ALTER DEFAULT PRIVILEGES нужен
-- отдельно: без него таблица СЛЕДУЮЩЕЙ миграции будет невидима приложению, и дефект
-- вскроется не при миграции, а на первом чтении.
GRANT USAGE ON SCHEMA public TO n4_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO n4_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO n4_app;
ALTER DEFAULT PRIVILEGES FOR ROLE n4_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO n4_app;
ALTER DEFAULT PRIVILEGES FOR ROLE n4_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO n4_app;
