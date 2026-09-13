-- Правка по review-report.md (третий обзор) RV-consent-and-telegram-auth-04: заявка на повтор
-- была ключевана по `account_id`. Частичный уникальный индекс `account_telegram_user_id_active_unique`
-- (миграция 003) исключает ТОЛЬКО `erased`-строки из уникальности `telegram_user_id` — после
-- реальной эразуры повторный вход тем же `telegram_user_id` создаёт НОВЫЙ `account_id`
-- (AC-consent-and-telegram-auth-20). Пара `(старый account_id, hash)` оставалась в истории, но
-- пара `(новый account_id, hash)` НЕ существовала — байт-в-байт та же строка `initData` (ещё не
-- просроченная 24-часовым окном свежести `verifyTelegramInitData`) авторизовала заново уже под
-- новым аккаунтом, минуя эразуру, которая её якобы навсегда закрыла.
--
-- `telegram_user_id` НЕ меняется ни эразурой (она не трогает эту колонку), ни созданием новой
-- строки `account` (это тот же самый Telegram-пользователь) — заявка на повтор теперь ключуется
-- им, независимо от того, какой `account_id` управляет данными СЕЙЧАС.

ALTER TABLE telegram_login_replay ADD COLUMN telegram_user_id text;

-- Обратная совместимость для уже существующих строк (пустая таблица на свежей БД, но защитно
-- на случай непустой): восстановить `telegram_user_id` из ещё живого `account_id`, если он
-- ссылается на строку, у которой это поле есть.
UPDATE telegram_login_replay r
  SET telegram_user_id = a.telegram_user_id
  FROM account a
  WHERE r.account_id = a.id AND r.telegram_user_id IS NULL;

DROP INDEX telegram_login_replay_account_hash_unique;
CREATE UNIQUE INDEX telegram_login_replay_telegram_user_hash_unique
  ON telegram_login_replay (telegram_user_id, hash) WHERE telegram_user_id IS NOT NULL;

-- `device_session_id`-ветка (симметрия с account, не задействованная текущей реализацией —
-- см. миграцию 004) НЕ имеет этой проблемы: device_session не переиздаётся эразурой, её id
-- стабилен. Индекс `telegram_login_replay_session_hash_unique` остаётся без изменений.
