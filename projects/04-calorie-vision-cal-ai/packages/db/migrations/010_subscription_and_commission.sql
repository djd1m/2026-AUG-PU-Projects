-- Фича `subscription-and-commission` (OWN-001…011, ADR-011…014).
--
-- Пять новых таблиц и одна колонка. Канон §4 объявлял ровно 14 сущностей — расширение
-- зафиксировано поправкой в `docs/decisions-owner.md`, а не внесено молча: канон, который
-- правят мимо записи, перестаёт быть источником истины.
--
-- Деньги — ЦЕЛОЕ ЧИСЛО КОПЕЕК везде. `numeric` не используется даже там, где он корректен:
-- одна единица измерения по всей системе дешевле, чем два способа считать одно и то же.

CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'expired');
CREATE TYPE payment_status      AS ENUM ('succeeded', 'refunded', 'chargeback', 'failed');
CREATE TYPE commission_kind     AS ENUM ('accrual', 'clawback', 'payout');

-- ─── 15. subscription ──────────────────────────────────────────────────────────────────
CREATE TABLE subscription (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  account_id            uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  status                subscription_status NOT NULL DEFAULT 'active',
  price_minor           integer     NOT NULL CHECK (price_minor > 0),
  currency              text        NOT NULL DEFAULT 'RUB',
  current_period_start  timestamptz NOT NULL,
  current_period_end    timestamptz NOT NULL,
  -- Партнёр ФИКСИРУЕТСЯ первой оплатой и дальше не меняется (ADR-012): поздняя смена
  -- атрибуции иначе крала бы доход у того, кто клиента привёл.
  commission_partner_id uuid REFERENCES partner(id),
  failed_renewals       integer     NOT NULL DEFAULT 0 CHECK (failed_renewals >= 0),
  provider              text        NOT NULL,
  provider_customer_id  text,
  -- Аренда продления — тот же приём, что у распознавания (ADR-003): предикат плюс fence,
  -- а не координация в памяти процесса.
  leased_until          timestamptz,
  lease_owner           uuid,
  lease_fence           integer     NOT NULL DEFAULT 0,
  canceled_at           timestamptz,
  CONSTRAINT subscription_period_order CHECK (current_period_end > current_period_start)
);
-- Одна ДЕЙСТВУЮЩАЯ подписка на аккаунт: единственность обеспечивает БАЗА, не код.
CREATE UNIQUE INDEX subscription_one_active ON subscription (account_id) WHERE status = 'active';
CREATE INDEX subscription_renewal_idx ON subscription (current_period_end)
  WHERE status IN ('active', 'past_due');

-- ─── 16. payment_intent ────────────────────────────────────────────────────────────────
-- Идентификатор выдаётся ДО ухода к провайдеру (long-running-job.md): ручка, приходящая
-- вместе с результатом, умирает вместе с оборванным ответом.
CREATE TABLE payment_intent (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status          text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'succeeded', 'failed')),
  failure_reason  text,
  price_minor     integer NOT NULL CHECK (price_minor > 0),
  CONSTRAINT payment_intent_idem UNIQUE (account_id, idempotency_key)
);

-- ─── 17. payment_event ─────────────────────────────────────────────────────────────────
-- КЛЮЧ ПОВТОРНОСТИ вебхука (incoming-webhooks.md): поле — идентификатор события У
-- ОТПРАВИТЕЛЯ, место — эта таблица, механизм — уникальный индекс. «Прочитать, потом
-- записать» здесь не годится: две попытки доставки приезжают ОДНОВРЕМЕННО.
CREATE TABLE payment_event (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text        NOT NULL,
  provider_event_id text        NOT NULL,
  payload_sha256    text        NOT NULL,
  occurred_at       timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_event_unique UNIQUE (provider, provider_event_id)
);

-- ─── 18. payment ───────────────────────────────────────────────────────────────────────
CREATE TABLE payment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  subscription_id     uuid REFERENCES subscription(id) ON DELETE SET NULL,
  account_id          uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  provider            text    NOT NULL,
  provider_payment_id text    NOT NULL,
  gross_minor         integer NOT NULL CHECK (gross_minor >= 0),
  fee_minor           integer NOT NULL CHECK (fee_minor >= 0),
  -- `net` приходит ИЗ СОБЫТИЯ провайдера и нами не вычисляется: вычислить значило бы
  -- угадать удержание (ADR-011).
  net_minor           integer NOT NULL,
  status              payment_status NOT NULL,
  -- Сумма, не совпавшая с ценой подписки, принимается, но НЕ начисляется автоматически:
  -- расхождение — признак либо смены цены, либо подделки.
  needs_review        boolean NOT NULL DEFAULT false,
  paid_at             timestamptz NOT NULL,
  CONSTRAINT payment_provider_unique UNIQUE (provider, provider_payment_id)
);

-- ─── 19. commission_entry ──────────────────────────────────────────────────────────────
-- Леджер ТОЛЬКО ДОПОЛНЯЕТСЯ (ADR-013). Возврат — компенсирующая запись со знаком минус, а
-- не UPDATE: уменьшение поля «баланс» стирает историю вместе с доказательством.
CREATE TABLE commission_entry (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  partner_id   uuid NOT NULL REFERENCES partner(id) ON DELETE RESTRICT,
  payment_id   uuid REFERENCES payment(id) ON DELETE RESTRICT,
  kind         commission_kind NOT NULL,
  amount_minor integer NOT NULL,
  available_at timestamptz NOT NULL,
  payout_key   text,
  note         text,
  -- Знак записи определяется её видом, и это проверяет БАЗА: начисление не может быть
  -- отрицательным, выплата и обратное списание — положительными.
  CONSTRAINT commission_sign CHECK (
    (kind = 'accrual'  AND amount_minor >  0) OR
    (kind IN ('clawback', 'payout') AND amount_minor < 0)
  ),
  CONSTRAINT commission_payout_key CHECK ((kind = 'payout') = (payout_key IS NOT NULL))
);
-- Одно начисление на платёж — защита от двойного начисления на уровне базы, а не кода.
CREATE UNIQUE INDEX commission_accrual_once ON commission_entry (payment_id) WHERE kind = 'accrual';
CREATE UNIQUE INDEX commission_clawback_once ON commission_entry (payment_id) WHERE kind = 'clawback';
-- Двойной клик по кнопке выплаты не выплачивает дважды.
CREATE UNIQUE INDEX commission_payout_once ON commission_entry (partner_id, payout_key) WHERE kind = 'payout';
CREATE INDEX commission_partner_idx ON commission_entry (partner_id, available_at);

-- ─── partner: ставка живёт на партнёре, не константой ──────────────────────────────────
-- Обязательство перед уже привлечённым партнёром бессрочно (OWN-003), значит менять его
-- задним числом нельзя, а для НОВЫХ партнёров — нужно. Константа в коде сделала бы второе
-- невозможным без нарушения первого.
ALTER TABLE partner
  ADD COLUMN commission_rate_bp integer NOT NULL DEFAULT 5000
    CHECK (commission_rate_bp BETWEEN 0 AND 10000);
-- откат: DROP TABLE commission_entry, payment, payment_event, payment_intent, subscription; DROP TYPE commission_kind, payment_status, subscription_status; ALTER TABLE partner DROP COLUMN commission_rate_bp;
