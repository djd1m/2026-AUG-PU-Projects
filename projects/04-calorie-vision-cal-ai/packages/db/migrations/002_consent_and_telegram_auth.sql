-- Фича consent-and-telegram-auth: два поля-расширения (DEC-A-016, DEC-A-019) и одна правка
-- уникальности (AC-consent-and-telegram-auth-20). Новых таблиц нет: 03_architecture.md
-- «Data Architecture — дополнение к foundation».

-- ─── Защита от повтора initData (DEC-A-016) ────────────────────────────────────────────
-- На account — сверка ПОСЛЕ того, как аккаунт найден/создан; на device_session — сверка
-- ДО того, как аккаунт существует (первый вход этой сессии).
ALTER TABLE account
  ADD COLUMN last_telegram_auth_hash text,
  ADD COLUMN last_telegram_auth_at   timestamptz;

-- ─── Согласие для АНОНИМНОЙ сессии (DEC-A-019, отменяет анонимное исключение) ──────────
-- Те же три поля, что уже есть у account: анонимный дневник существует ДО входа, и
-- NFR-SEC-002 «по умолчанию всё закрыто» относится к самому дневнику, не к его владельцу.
-- При входе через Telegram эти поля ПЕРЕНОСЯТСЯ на account (TelegramLogin), не запрашиваются заново.
ALTER TABLE device_session
  ADD COLUMN last_telegram_auth_hash text,
  ADD COLUMN last_telegram_auth_at   timestamptz,
  ADD COLUMN consent_version         text,
  ADD COLUMN consent_text_hash       text,
  ADD COLUMN consent_at              timestamptz;

-- ─── AC-consent-and-telegram-auth-20: удалённый аккаунт не переиспользуется ────────────
-- Миграция 001 (foundation) объявила ПОЛНУЮ уникальность telegram_user_id. Это делало
-- невозможным повторный вход тем же telegram_user_id после erased: новая строка не могла
-- быть вставлена, пока старая (уже erased) существует. Частичная уникальность, исключающая
-- erased-строки, — то же решение, что TelegramLogin шаг 3 «удалённый аккаунт не
-- переиспользуется, создаётся НОВАЯ строка с НОВЫМ id».
ALTER TABLE account DROP CONSTRAINT account_telegram_user_id_unique;
CREATE UNIQUE INDEX account_telegram_user_id_active_unique
  ON account (telegram_user_id) WHERE status != 'erased';

-- ─── RunErasureJob шаг 1: выбор батча по 'erasing' ──────────────────────────────────────
-- Малое ожидаемое число строк, но без индекса некорректно с ростом базы.
CREATE INDEX account_erasing_deadline_idx
  ON account (deletion_requested_at) WHERE status = 'erasing';

-- Грантов не требуется: ALTER TABLE добавляет колонки к уже существующим таблицам, права
-- на которые n4_app получил в миграции 001 (GRANT … ON ALL TABLES). Новых объектов,
-- которых не покрывала бы ALTER DEFAULT PRIVILEGES, эта миграция не создаёт.
