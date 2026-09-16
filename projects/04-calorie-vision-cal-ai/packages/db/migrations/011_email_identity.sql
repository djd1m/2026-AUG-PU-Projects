-- OWN-012: PWA — первый приоритет, Telegram — вторая очередь.
--
-- До этой миграции единственной идентичностью аккаунта был Telegram (`telegram_user_id NOT
-- NULL`, вход только по `initData`). В PWA без Telegram аккаунт не создавался — а значит не
-- оформлялась подписка и не открывались кабинеты. Здесь появляется вторая идентичность —
-- почта с паролем; Telegram остаётся, но становится необязательным.
--
-- Аккаунт ОБЯЗАН иметь хотя бы одну идентичность (CHECK ниже): строка без обеих — это
-- «кто-то», к кому нельзя вернуться, и подписка на ней потерялась бы.

ALTER TABLE account ALTER COLUMN telegram_user_id DROP NOT NULL;
ALTER TABLE account
  ADD COLUMN email         text,
  ADD COLUMN password_hash text;

-- Почта уникальна среди НЕудалённых аккаунтов — тот же приём, что у `telegram_user_id`
-- (миграция 003): удалённый аккаунт не переиспользуется, повторная регистрация той же
-- почтой создаёт НОВУЮ строку.
CREATE UNIQUE INDEX account_email_active_unique
  ON account (lower(email)) WHERE status <> 'erased' AND email IS NOT NULL;

ALTER TABLE account
  ADD CONSTRAINT account_identity_present
    CHECK (telegram_user_id IS NOT NULL OR email IS NOT NULL),
  -- Почта без пароля — вход, в который нельзя войти; пароль без почты — не к чему приложить.
  ADD CONSTRAINT account_email_needs_password
    CHECK ((email IS NULL) = (password_hash IS NULL));

-- ─── 20. partner_invite ────────────────────────────────────────────────────────────────
-- Роль партнёра выдаётся ГРАНТОМ владельца, не полем клиента (образец — enrollment N3a):
-- владелец создаёт одноразовое приглашение к конкретной строке `partner`, блогер открывает
-- ссылку, регистрируется — и его аккаунт привязывается к этому партнёру. Хранится ХЕШ
-- токена: утечка таблицы не даёт ссылок.
CREATE TABLE partner_invite (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  partner_id          uuid NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  token_hash          text NOT NULL UNIQUE,
  expires_at          timestamptz NOT NULL,
  used_at             timestamptz,
  used_by_account_id  uuid REFERENCES account(id) ON DELETE SET NULL,
  CHECK ((used_at IS NULL) = (used_by_account_id IS NULL))
);
CREATE INDEX partner_invite_partner_idx ON partner_invite (partner_id);
