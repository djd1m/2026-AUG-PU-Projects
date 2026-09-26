-- tariffs-and-interest (фича 14, FR-TARIFF-002/003, ADR-017 дополненный, A-N6-040): живая оплата ЮKassa по решению
-- владельца 26.09. Только добавляющая миграция. Донор — N4 `010_subscription_and_commission.sql`, адаптировано: план
-- аккаунта вместо подписки, без автопродления, комиссий (фича 15) и статуса past_due (разовая оплата на 30 дней).

-- 1. Откуда у аккаунта платный план. `payment` истекает по plan_paid_until (сторож возвращает free), `operator`
--    не истекает (SetPlanByOperator, пилотные студии), `none` — план free.
ALTER TABLE account ADD COLUMN plan_paid_until timestamptz;
ALTER TABLE account ADD COLUMN plan_source text NOT NULL DEFAULT 'none' CHECK (plan_source IN ('none', 'payment', 'operator'));
ALTER TABLE account ADD CONSTRAINT account_paid_plan_dated CHECK (plan_source <> 'payment' OR plan_paid_until IS NOT NULL);
-- Платный план с источником 'none' (назначен до этой миграции) не истекает — как план оператора; истекает ТОЛЬКО 'payment'.
CREATE INDEX account_paid_plan_expiry ON account (plan_paid_until) WHERE plan_source = 'payment';

-- 2. Намерение оплаты: идентификатор выдаётся ДО ухода к провайдеру (long-running-job), он же ключ идемпотентности у
--    ЮKassa и metadata.order_id платежа. Повтор с тем же ключом клиента — то же намерение (UNIQUE).
CREATE TABLE payment_intent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('nobadge', 'studio')),
  price_minor integer NOT NULL CHECK (price_minor > 0),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  provider_payment_id text,
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

-- 4. Принятые деньги. Строка остаётся и после удаления аккаунта (учёт), поэтому SET NULL. needs_review — разбирает
--    оператор (решение владельца 26.09): сумма ≠ цене намерения, возврат, платёж без нашего намерения.
CREATE TABLE payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  intent_id uuid REFERENCES payment_intent(id) ON DELETE SET NULL,
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('yookassa', 'fake')),
  provider_payment_id text NOT NULL CHECK (length(provider_payment_id) BETWEEN 1 AND 100),
  plan text CHECK (plan IN ('nobadge', 'studio')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  fee_minor integer CHECK (fee_minor >= 0),
  status text NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'refunded')),
  needs_review boolean NOT NULL DEFAULT false,
  review_reason text CHECK (review_reason IN ('amount_mismatch', 'refund', 'unknown_intent')),
  paid_at timestamptz NOT NULL,
  CHECK (needs_review = (review_reason IS NOT NULL)),
  UNIQUE (provider, provider_payment_id)
);
CREATE INDEX payment_needs_review ON payment (created_at) WHERE needs_review;

-- 5. Журнал оператора (SetPlanByOperator п.3): замена платежа, а не его имитация — кто, когда, зачем, было → стало.
CREATE TABLE operator_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  operator text NOT NULL CHECK (length(btrim(operator)) BETWEEN 1 AND 100),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('set_plan')),
  plan_before text NOT NULL, plan_after text NOT NULL
);

-- 6. Экран, с которого пришёл интерес, — закрытый набор (было свободное text). NOT VALID: миграция только добавляющая,
--    старые строки не переписываются, новые проверяются.
ALTER TABLE pro_interest ADD CONSTRAINT pro_interest_origin_screen
  CHECK (origin_screen IN ('pricing', 'upgrade', 'install', 'cabinet')) NOT VALID;
