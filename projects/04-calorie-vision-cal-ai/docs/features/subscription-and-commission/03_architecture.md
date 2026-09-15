# Фича `subscription-and-commission` — архитектура

## Что добавляется к существующей системе

Новых сервисов compose НЕТ: подписка живёт в `api`, продления — отдельный цикл внутри уже
существующего процесса `recognizer` (он уже умеет аренду задания с fence, и второй воркер ради
той же механики не нужен). Канон §6 «ровно 6 сервисов» не меняется.

## Схема данных (миграция 010)

Деньги — целое число копеек. Плавающая точка не используется нигде, и это проверяется стражем
по исходнику (AC-14).

```sql
CREATE TYPE subscription_status AS ENUM ('active','past_due','canceled','expired');
CREATE TYPE payment_status      AS ENUM ('succeeded','refunded','chargeback','failed');
CREATE TYPE commission_kind     AS ENUM ('accrual','clawback','payout');

CREATE TABLE subscription (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  status                subscription_status NOT NULL DEFAULT 'active',
  price_minor           integer NOT NULL CHECK (price_minor > 0),
  currency              text    NOT NULL DEFAULT 'RUB',
  current_period_start  timestamptz NOT NULL,
  current_period_end    timestamptz NOT NULL,
  -- партнёр ФИКСИРУЕТСЯ первой оплатой и больше не меняется (ADR-012)
  commission_partner_id uuid REFERENCES partner(id),
  failed_renewals       integer NOT NULL DEFAULT 0 CHECK (failed_renewals >= 0),
  provider              text NOT NULL,
  provider_customer_id  text,
  leased_until          timestamptz,
  lease_fence           integer NOT NULL DEFAULT 0,
  canceled_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscription_one_active ON subscription (account_id) WHERE status = 'active';

CREATE TABLE payment_intent (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status          text NOT NULL DEFAULT 'created',
  price_minor     integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intent_idem UNIQUE (account_id, idempotency_key)
);

-- Ключ повторности вебхука. МЕСТО хранения названо, механизм атомарен (incoming-webhooks.md).
CREATE TABLE payment_event (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL,
  provider_event_id text NOT NULL,
  payload_sha256    text NOT NULL,
  occurred_at       timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_event_unique UNIQUE (provider, provider_event_id)
);

CREATE TABLE payment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     uuid REFERENCES subscription(id) ON DELETE SET NULL,
  account_id          uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  provider            text NOT NULL,
  provider_payment_id text NOT NULL,
  gross_minor         integer NOT NULL CHECK (gross_minor >= 0),
  fee_minor           integer NOT NULL CHECK (fee_minor >= 0),
  net_minor           integer NOT NULL,          -- из события провайдера, НЕ вычисляется нами
  status              payment_status NOT NULL,
  needs_review        boolean NOT NULL DEFAULT false,
  paid_at             timestamptz NOT NULL,
  CONSTRAINT payment_provider_unique UNIQUE (provider, provider_payment_id)
);

-- Леджер: только добавление. Возврат — компенсирующая запись, не UPDATE (ADR-013).
CREATE TABLE commission_entry (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   uuid NOT NULL REFERENCES partner(id) ON DELETE RESTRICT,
  payment_id   uuid REFERENCES payment(id) ON DELETE RESTRICT,
  kind         commission_kind NOT NULL,
  amount_minor integer NOT NULL,                 -- accrual > 0, clawback/payout < 0
  available_at timestamptz NOT NULL,
  payout_key   text,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX commission_accrual_once ON commission_entry (payment_id) WHERE kind = 'accrual';
CREATE UNIQUE INDEX commission_payout_once  ON commission_entry (partner_id, payout_key) WHERE kind = 'payout';

ALTER TABLE partner ADD COLUMN commission_rate_bp integer NOT NULL DEFAULT 5000
  CHECK (commission_rate_bp BETWEEN 0 AND 10000);
```

Почему ставка — колонка партнёра, а не константа: обязательство перед уже привлечённым партнёром
бессрочно (OWN-003), значит изменить процент задним числом нельзя, а для новых партнёров — нужно.
Константа в коде сделала бы второе невозможным без нарушения первого.

## Маршруты (поправка к канону §5, зафиксирована в `decisions-owner.md`)

| Маршрут | Назначение |
|---|---|
| `POST /api/v1/subscription/checkout` | создать намерение, получить адрес формы провайдера |
| `GET /api/v1/subscription` | текущее состояние подписки владельца сессии |
| `POST /api/v1/subscription/cancel` | отменить продление, период дорабатывает |
| `POST /api/v1/webhooks/payments/{provider}` | вебхук провайдера (единственный маршрут без сессии) |
| `GET /api/v1/partner/earnings` | деньги партнёра: начислено / доступно / выплачено |
| `GET /api/v1/admin/overview` | кабинет владельца |
| `POST /api/v1/admin/payouts` | отметить выплату вручную |

Маршрут вебхука — единственный публичный без cookie-сессии, поэтому его защита целиком лежит на
подписи и ключе повторности, а не на сессии.

## Внешняя зависимость: платёжный провайдер

Скрыт за интерфейсом `PaymentProvider` с тремя реализациями — ровно как `ModelProvider`:

| Реализация | Когда |
|---|---|
| `FakePaymentProvider` | по умолчанию и в тестах; детерминированные события, включая возврат, чарджбэк, повтор доставки и перестановку |
| `YooKassaProvider` | живой режим, включается ключом в окружении |
| `CloudPaymentsProvider` | альтернатива, решение владельца |

Отсутствие ключа — НЕ повод для тихого фейка в проде: живой режим требуется явным
`N4_PAYMENTS_MODE=live`, и в этом режиме отсутствие ключа валит старт (`honest-configuration`
CFG-S1). Фейк допустим только при `N4_PAYMENTS_MODE=fake`, и прогон на нём НИКОГДА не объявляется
проверкой приёма денег.

## Переменные окружения

| Переменная | Форма | Отсутствие |
|---|---|---|
| `N4_SUBSCRIPTION_PRICE_MINOR` | `${VAR:?}` | валит старт |
| `N4_SCAN_LIMIT_PRO` | `${VAR:?}` | валит старт (ADR-007 распространяется) |
| `N4_COMMISSION_HOLD_DAYS` | `${VAR:?}` | валит старт |
| `N4_PAYMENTS_MODE` | `${VAR:?}` (`fake` \| `live`) | валит старт |
| `N4_PAYMENTS_SECRET_KEY`, `N4_PAYMENTS_WEBHOOK_SECRET` | `${VAR:?}` при `live` | валит старт в live |

Секреты живут только в `api` (и ключ вебхука — только там). У `web` их нет, и это проверяемо
списком `environment:` сервиса.

## Безопасность

- Кабинет владельца: закрытый список `telegram_user_id` В КОДЕ. Чужой — `404`, не `403`.
- Партнёр видит суммы и факты платежей, но НЕ видит, кто именно заплатил: ни имени, ни контакта,
  ни идентификатора аккаунта. Иначе партнёрская программа становится каналом утечки данных о
  питании — специальной категории ПДн (ADR-009).
- Данные карты не проходят через нас никогда: форму показывает провайдер, мы храним только его
  идентификаторы.
- В журнал не попадают: ключ провайдера, секрет вебхука, сырое тело события, идентификатор
  плательщика.

## Что эта архитектура НЕ решает

Кассовый разрыв при возврате после выплаты: если возврат случился позже выплаты, у партнёра
образуется отрицательный баланс, который гасится будущими начислениями. Механизма взыскания у
партнёра без будущих начислений здесь нет — и не может быть в коде, это вопрос оферты.
