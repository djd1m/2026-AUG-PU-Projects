-- partner-and-studio (фича 15, FR-PARTNER-001…003, FR-GROWTH-002/004/007, A-N6-043): только добавляющая миграция.
-- Донор — N4 projects/04-calorie-vision-cal-ai/packages/db/migrations/010_subscription_and_commission.sql (commission_entry,
-- частичные уникальные индексы «один раз на платёж») — адаптировано: без подписки; партнёр N6 — ВЛАДЕЛЕЦ partner_code
-- (отдельной таблицы partner нет); начисление привязано к платежу ЮKassa фичи 14.

-- 1. Ставка — на коде, а не константой (N4 ADR-012): 2000 б.п. = 20 % — решение владельца 26.09 (A-N6-043).
ALTER TABLE partner_code ADD COLUMN commission_rate_bp integer NOT NULL DEFAULT 2000
  CONSTRAINT partner_code_rate_range CHECK (commission_rate_bp BETWEEN 0 AND 10000);
-- Заморозка анти-накруткой или оператором: когда и почему (FR-PARTNER-003 «до ручной проверки»).
ALTER TABLE partner_code ADD COLUMN frozen_at timestamptz;
ALTER TABLE partner_code ADD COLUMN frozen_reason text CHECK (frozen_reason IN ('antifraud_ip_burst', 'operator'));

-- 2. Префикс IP регистрации (152-ФЗ: только /24 или /48) — вход правила self-referral «тот же префикс за 24 ч».
ALTER TABLE account ADD COLUMN signup_ip_prefix cidr CONSTRAINT account_signup_prefix_only
  CHECK (signup_ip_prefix IS NULL OR (family(signup_ip_prefix) = 4 AND masklen(signup_ip_prefix) = 24)
    OR (family(signup_ip_prefix) = 6 AND masklen(signup_ip_prefix) = 48));

-- 3. Засчитанные применения кода — окно анти-накрутки «> 20 с одного префикса за 10 мин» (FR-PARTNER-003).
--    Считается под advisory-блокировкой кода (partners.ts): одновременные применения сериализуются.
CREATE TABLE partner_code_use (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  partner_code_id uuid NOT NULL REFERENCES partner_code(id) ON DELETE CASCADE,
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('code', 'invite', 'cookie')),
  ip_prefix cidr NOT NULL CONSTRAINT partner_code_use_prefix_only
    CHECK ((family(ip_prefix) = 4 AND masklen(ip_prefix) = 24) OR (family(ip_prefix) = 6 AND masklen(ip_prefix) = 48))
);
CREATE INDEX partner_code_use_window ON partner_code_use (partner_code_id, ip_prefix, created_at);

-- 4. Деньги партнёра: баланс НЕ хранится полем — он есть сумма записей (N4 ADR-013). Целые копейки.
--    accrual > 0 (с платежа), clawback < 0 (возврат этого платежа), payout < 0 (выплата оператором по ключу).
CREATE TABLE commission_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  partner_account_id uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
  partner_code_id uuid REFERENCES partner_code(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payment(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('accrual', 'clawback', 'payout')),
  amount_minor bigint NOT NULL,
  available_at timestamptz NOT NULL,
  payout_key text CHECK (payout_key IS NULL OR length(payout_key) BETWEEN 1 AND 100),
  CONSTRAINT commission_sign CHECK ((kind = 'accrual' AND amount_minor > 0) OR (kind IN ('clawback', 'payout') AND amount_minor < 0)),
  CONSTRAINT commission_payment_iff_not_payout CHECK ((kind = 'payout') = (payment_id IS NULL)),
  CONSTRAINT commission_key_iff_payout CHECK ((kind = 'payout') = (payout_key IS NOT NULL))
);
-- Двойное начисление и двойное сторно на один платёж невозможны на уровне БАЗЫ (одновременные доставки не видят друг
-- друга в коде, но видят в индексе); повтор выплаты с тем же ключом — одна запись.
CREATE UNIQUE INDEX commission_accrual_once ON commission_entry (payment_id) WHERE kind = 'accrual';
CREATE UNIQUE INDEX commission_clawback_once ON commission_entry (payment_id) WHERE kind = 'clawback';
CREATE UNIQUE INDEX commission_payout_once ON commission_entry (partner_account_id, payout_key) WHERE kind = 'payout';
CREATE INDEX commission_partner ON commission_entry (partner_account_id, created_at);

-- 5. Реквизиты выплаты: только СБП-телефон (+ банк); номер карты отвергается кодом (N4 payout-details.ts, PCI DSS).
CREATE TABLE partner_payout_details (
  account_id uuid PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL CHECK (method = 'sbp'),
  phone text NOT NULL CHECK (phone ~ '^\+7[0-9]{10}$'),
  bank text CHECK (bank IS NULL OR length(bank) BETWEEN 1 AND 100)
);

-- 6. Журнал партнёрки: заморозки, разморозки, выдача кодов, выплаты, пропуски начисления (оператор разбирает).
CREATE TABLE partner_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  partner_code_id uuid REFERENCES partner_code(id) ON DELETE SET NULL,
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('frozen_antifraud', 'unfrozen', 'code_issued', 'payout_recorded', 'accrual_skipped_fee_unknown')),
  operator text CHECK (operator IS NULL OR length(btrim(operator)) BETWEEN 1 AND 100),
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
  ip_prefix cidr,
  amount_minor bigint
);
CREATE INDEX partner_audit_code ON partner_audit (partner_code_id, created_at);

-- 7. Приглашения: поиск живого приглашения бота (создание нового гасит прежнее неиспользованное — studio.ts).
CREATE INDEX studio_invite_bot_open ON studio_invite (bot_id) WHERE accepted_by IS NULL;
