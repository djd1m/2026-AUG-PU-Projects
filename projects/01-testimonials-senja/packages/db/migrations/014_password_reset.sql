-- packages/db/migrations/014_password_reset.sql
--
-- FR-015: восстановление пароля по email.
--
-- token_hash, а НЕ токен — та же дисциплина, что у sessions.token_hash, и по той же причине:
-- компрометация БД не должна давать возможность сбросить пароль любому аккаунту. У донора
-- (genai-pulse-discovery/packages/auth/auth-core/src/password-reset.ts:40-58) значение лежит
-- в Redis открытым; эта форма сюда не переносится.
--
-- RLS на таблице НЕ включается намеренно. Контекст арендатора на пути восстановления ещё не
-- установлен: человек не аутентифицирован, и account_id появляется только ПОСЛЕ погашения
-- токена. Изоляцию обеспечивает то, что account_id берётся ИЗ САМОЙ СТРОКИ токена, а не из
-- входных данных, — подделать его нечем. Записано явно, потому что «RLS нет» без объяснения
-- читается как упущение.

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  -- unique: совпадение двух токенов становится ошибкой БД, а не тихим совпадением
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ЧАСТИЧНЫЙ УНИКАЛЬНЫЙ: у аккаунта не может быть двух живых токенов одновременно.
--
-- Уникальность здесь несёт нагрузку, а не ускорение. Инвариант «две живые ссылки на один
-- аккаунт — это две двери там, где должна быть одна» пытались обеспечить связкой
-- «UPDATE … SET used_at → INSERT», и под READ COMMITTED она НЕ РАБОТАЕТ: UPDATE не видит
-- ещё не закоммиченную вставку соседа и не может заблокировать строку, которой пока нет.
-- Проверено прогоном: два параллельных выпуска дают ДВА живых токена.
--
-- Ограничение БД закрывает это по построению, как `on conflict (code) do nothing` у
-- партнёрских кодов и `unique(payment_event_id)` у начислений. Проигравший получает
-- 23505 и тот же общий ответ: письмо для этого аккаунта уже в пути.
create unique index if not exists password_reset_tokens_account_active_idx
  on password_reset_tokens (account_id) where used_at is null;

-- Только app_service: весь путь восстановления идёт под ней, потому что человек не
-- аутентифицирован ни в одной из двух транзакций.
grant select, insert, update on password_reset_tokens to app_service;
