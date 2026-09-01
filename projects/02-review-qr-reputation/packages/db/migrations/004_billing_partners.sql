-- 004_billing_partners.sql — тарифы, оплата, партнёрская программа.

CREATE TABLE subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan               plan NOT NULL,
  places_limit       int NOT NULL,
  current_period_end timestamptz NOT NULL,
  status             text NOT NULL
);

-- Одна активная подписка на аккаунт — ограничением БД, а не проверкой перед вставкой.
CREATE UNIQUE INDEX uq_subscriptions_active_account
  ON subscriptions(account_id) WHERE status = 'active';

CREATE TABLE checkout_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_session_id text NOT NULL,
  status              checkout_status NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_checkout_sessions_provider_session UNIQUE (provider_session_id)
);

-- ИДЕМПОТЕНТНОСТЬ ВЕБХУКА. Ключ составной: '<тип события>:<id объекта>'.
-- Голый id объекта схлопнул бы «оплачено» и «отменено» одного платежа в один ключ, и
-- второе уведомление отбросилось бы как дубль первого — оплата не применилась бы никогда.
-- У ЮKassa отдельного идентификатора события НЕТ, поэтому ключ собирает приложение.
CREATE TABLE webhook_events (
  provider     text NOT NULL,
  event_id     text NOT NULL,
  payload      jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_webhook_events PRIMARY KEY (provider, event_id)
);

CREATE TABLE partners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  promo_code  text NOT NULL,
  -- СТАТУС, а не удаление строки: деактивация прекращает атрибуцию новых, но не отбирает
  -- уже заработанное. Удалив партнёра, мы потеряли бы историю начислений.
  status      partner_status NOT NULL DEFAULT 'active',
  payout_rate numeric NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_partners_promo_code UNIQUE (promo_code)
);

CREATE TABLE attributions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id),
  source     attribution_source NOT NULL,
  status     attribution_status NOT NULL DEFAULT 'pending',
  -- Срок ХРАНИТСЯ, а не вычисляется при каждой проверке: вычисление разъедется с окном,
  -- когда окно однажды изменят, и старые атрибуции задним числом сменят срок.
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id   uuid NOT NULL REFERENCES attributions(id),
  payment_event_id text NOT NULL,
  amount           numeric NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- ВТОРАЯ, НЕЗАВИСИМАЯ гарантия. webhook_events уже даёт идемпотентность доставки; эта
  -- защищает от повторного НАЧИСЛЕНИЯ по любой причине, включая непредусмотренную.
  -- Две гарантии, отказывающие по разным причинам, сильнее одной.
  CONSTRAINT uq_commissions_payment_event UNIQUE (payment_event_id)
);

CREATE TABLE public_review_counts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  observed_at date NOT NULL,
  count       int NOT NULL,
  -- ТОЛЬКО 'manual'. API отзывов у Яндекс.Карт и 2ГИС НЕ СУЩЕСТВУЕТ: продукт физически не
  -- может узнать, опубликован ли отзыв. Перечисление из одного значения — это запись факта
  -- о мире, а не задел: автоматический источник появится вместе с осознанной правкой схемы.
  source      review_count_source NOT NULL DEFAULT 'manual',
  CONSTRAINT uq_public_review_counts_place_date UNIQUE (place_id, observed_at)
);

CREATE INDEX ix_platform_links_place ON platform_links(place_id);
