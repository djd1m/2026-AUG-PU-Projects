-- Правка по review-report.md RV-consent-and-telegram-auth-03: единственный слот
-- last_telegram_auth_hash/at (миграция 002) хранит только ПОСЛЕДНИЙ использованный hash —
-- последовательность «вход A → вход B → повтор A» перезаписывала слот входом B и пропускала
-- точный повтор A. Заменено историей ВСЕХ использованных подписей — постоянной (без TTL):
-- verifyTelegramInitData уже отклоняет initData старше 24 ч по auth_date, поэтому точный повтор
-- одной и той же подписи физически не может пройти проверку свежести позже 24 ч — окно
-- истории не нужно, достаточно факта «эта подпись уже использована этим владельцем».
--
-- Атомарность: заявка на повтор — ОДИН INSERT ... ON CONFLICT DO NOTHING. Ноль затронутых
-- строк И ЕСТЬ «уже использовано» — тот же паттерн, что checkAndConsumeQuota (foundation).

CREATE TABLE telegram_login_replay (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  account_id        uuid REFERENCES account(id) ON DELETE CASCADE,
  device_session_id uuid REFERENCES device_session(id) ON DELETE CASCADE,
  hash              text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT telegram_login_replay_exactly_one_owner CHECK (
    (account_id IS NOT NULL AND device_session_id IS NULL)
    OR (account_id IS NULL AND device_session_id IS NOT NULL)
  )
);
-- Владелец разрешается в account, ЕСЛИ он уже существует к моменту заявки (см.
-- registerAuthTelegramRoute) — device_session-строка остаётся для ДОКУМЕНТАЛЬНОЙ полноты
-- модели (симметрия с account) и для гипотетического пути без account, не задействованного
-- текущей реализацией.
CREATE UNIQUE INDEX telegram_login_replay_account_hash_unique
  ON telegram_login_replay (account_id, hash) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX telegram_login_replay_session_hash_unique
  ON telegram_login_replay (device_session_id, hash) WHERE device_session_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON telegram_login_replay TO n4_app;

-- Поля-предшественники (единственный слот) больше не читаются и не пишутся кодом.
ALTER TABLE account DROP COLUMN last_telegram_auth_hash;
ALTER TABLE account DROP COLUMN last_telegram_auth_at;
ALTER TABLE device_session DROP COLUMN last_telegram_auth_hash;
ALTER TABLE device_session DROP COLUMN last_telegram_auth_at;
