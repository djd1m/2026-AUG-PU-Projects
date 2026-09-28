-- Фича 30 payments (OWN-019, ADR-019): живая оплата ЮKassa. Только добавляющая миграция. Донор — N6
-- `006_tariffs_payments.sql` (сам взят из N4 `010_subscription_and_commission.sql`), адаптировано: платный план в N5
-- ОДИН (`paid`), поэтому у намерения и платежа нет колонки плана; комиссий нет (FR-GROWTH-004 «без выплат»);
-- `pro_interest` не трогается (его экран интереса остаётся для режима off).

-- 1. Откуда у аккаунта платный план. `payment` истекает по plan_paid_until (сторож возвращает free), `operator`
--    не истекает (ops:set-plan), `none` — план free или назначенный до этой миграции (не истекает).
ALTER TABLE account ADD COLUMN plan_paid_until timestamptz;
ALTER TABLE account ADD COLUMN plan_source text NOT NULL DEFAULT 'none' CHECK (plan_source IN ('none', 'payment', 'operator'));
ALTER TABLE account ADD CONSTRAINT account_paid_plan_dated CHECK (plan_source <> 'payment' OR plan_paid_until IS NOT NULL);
CREATE INDEX account_paid_plan_expiry ON account (plan_paid_until) WHERE plan_source = 'payment';

-- 2. Намерение оплаты: идентификатор выдаётся ДО ухода к провайдеру (long-running-job), он же ключ идемпотентности у
--    ЮKassa и metadata.order_id платежа. Повтор с тем же ключом клиента — то же намерение (UNIQUE).
CREATE TABLE payment_intent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  price_minor integer NOT NULL CHECK (price_minor > 0),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  provider_payment_id text CHECK (provider_payment_id IS NULL OR length(provider_payment_id) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'succeeded', 'canceled')),
  UNIQUE (account_id, idempotency_key)
);

-- 3. Ключ повторности входящего уведомления (incoming-webhooks): ПОЛЕ — `<событие>:<object.id>` ЮKassa (отдельного
--    id события у ЮKassa нет), МЕСТО — эта таблица, МЕХАНИЗМ — уникальный индекс: конфликт вставки и есть «уже обработано».
CREATE TABLE payment_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL CHECK (provider IN ('yookassa', 'fake')),
  provider_event_id text NOT NULL CHECK (length(provider_event_id) BETWEEN 1 AND 200),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (provider, provider_event_id)
);

-- 4. Принятые деньги. Строка остаётся и после стирания аккаунта (учёт), поэтому SET NULL. needs_review разбирает
--    оператор (OWN-019): сумма ≠ цене намерения, возврат, платёж без нашего намерения, аккаунт уже стирается.
CREATE TABLE payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  intent_id uuid REFERENCES payment_intent(id) ON DELETE SET NULL,
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('yookassa', 'fake')),
  provider_payment_id text NOT NULL CHECK (length(provider_payment_id) BETWEEN 1 AND 100),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  fee_minor integer CHECK (fee_minor >= 0),
  status text NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'refunded')),
  needs_review boolean NOT NULL DEFAULT false,
  review_reason text CHECK (review_reason IN ('amount_mismatch', 'refund', 'unknown_intent', 'account_erasing')),
  paid_at timestamptz NOT NULL,
  CHECK (needs_review = (review_reason IS NOT NULL)),
  UNIQUE (provider, provider_payment_id)
);
CREATE INDEX payment_needs_review ON payment (created_at) WHERE needs_review;

-- 5. Журнал оператора: замена платежа, а не его имитация — кто, когда, зачем, было → стало.
CREATE TABLE operator_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  operator text NOT NULL CHECK (length(btrim(operator)) BETWEEN 1 AND 100),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('set_plan')),
  plan_before text NOT NULL CHECK (plan_before IN ('free', 'paid')),
  plan_after text NOT NULL CHECK (plan_after IN ('free', 'paid'))
);
