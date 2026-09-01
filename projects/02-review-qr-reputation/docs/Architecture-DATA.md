# Architecture-DATA — DDL, именованные ограничения, роли, пулы

> Дополняет [`Architecture.md`](Architecture.md) §4 (концептуальная модель) и §3.1 (гранты).
> Вынесено отдельным файлом по лимиту 500 строк — и по более важной причине: `Pseudocode.md`
> ссылается на ограничения **по именам** (`ON CONFLICT ON CONSTRAINT …`), а имя, живущее только в
> переписке двух агентов, реализатор не найдёт. Здесь оно живёт в документе.
>
> **Что здесь канон:** имена таблиц, колонок, ограничений и ролей; значения ENUM; опции пула.
> **Чего здесь нет:** обоснований — они в `Architecture.md` и в ADR, и не дублируются.

## 1. ENUM

```sql
CREATE TYPE plan               AS ENUM ('free','point','network','agency');
CREATE TYPE member_role        AS ENUM ('admin','manager','viewer');
CREATE TYPE platform           AS ENUM ('yandex_maps','twogis');
CREATE TYPE link_kind          AS ENUM ('review_form','card');
CREATE TYPE guest_event_kind   AS ENUM ('scan','public_door_click','private_door_click');
CREATE TYPE channel            AS ENUM ('telegram','max');
CREATE TYPE delivery_status    AS ENUM ('pending','sending','sent','failed');
CREATE TYPE checkout_status    AS ENUM ('pending','completed','expired');
CREATE TYPE attribution_source AS ENUM ('promo_code','sub_account','cookie');
CREATE TYPE attribution_status AS ENUM ('pending','converted','expired','rejected','frozen');
CREATE TYPE partner_status     AS ENUM ('active','deactivated');
CREATE TYPE review_count_source AS ENUM ('manual');
```

`guest_event_kind` — три значения, **не** `door_click` + `platform IS NULL`. Значения взяты дословно
из FR-012, чтобы между требованием и схемой не было шага перевода; смысл, живущий в `NULL`, верен
ровно до первого, кто заведёт площадку без ссылки. `review_count_source` с единственным значением —
напоминание, что автоматического источника у этого числа нет и не появится (§8.3 Architecture).

## 2. Таблицы и именованные ограничения

Имя ограничения — часть контракта: `Pseudocode.md` ссылается на них в `ON CONFLICT`.

| Таблица | Колонки | Ограничения (имена — канон) |
|---|---|---|
| `accounts` | `id uuid`, `name text`, `plan plan DEFAULT 'free'`, `parent_account_id uuid NULL → accounts(id)`, `created_at` | `pk_accounts`; **`trg_accounts_one_level`** — триггер `BEFORE INSERT/UPDATE`: у родителя обязан быть `parent_account_id IS NULL`. Триггер, а не `CHECK`: подзапрос в `CHECK` запрещён |
| `owners` | `id uuid`, `email citext`, `password_hash text`, `created_at` | `pk_owners`, `uq_owners_email` UNIQUE(`email`) |
| `sessions` | `id uuid`, `owner_id → owners`, `token_hash bytea`, `expires_at`, `revoked_at NULL` | `pk_sessions`, `uq_sessions_token_hash` UNIQUE(`token_hash`) |
| `account_members` | `account_id → accounts`, `owner_id → owners`, `role member_role` | `pk_account_members` PRIMARY KEY(`account_id`,`owner_id`) |
| `places` | `id uuid`, `account_id → accounts`, `slug text`, `name text`, `address text`, `branding_required bool NOT NULL DEFAULT true`, `created_at`, `archived_at NULL` | `pk_places`, `uq_places_slug` UNIQUE(`slug`), `ck_places_slug_shape` CHECK(`slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'`) |
| `platform_links` | `id uuid`, `place_id → places ON DELETE CASCADE`, `platform platform`, `url text`, `link_kind link_kind`, `verified_at NULL`, `created_at` | `pk_platform_links`, **`uq_platform_links_place_platform`** UNIQUE(`place_id`,`platform`) |
| `private_feedback` | `id uuid`, `place_id → places`, `body text NOT NULL`, `rating smallint NULL`, `contact text NULL`, `created_at` | `pk_private_feedback`, `ck_private_feedback_rating` CHECK(`rating IS NULL OR rating BETWEEN 1 AND 5`), `ck_private_feedback_body` CHECK(`length(btrim(body)) BETWEEN 2 AND 2000`). **UNIQUE нет** |
| `notifications` | `id uuid`, `private_feedback_id → private_feedback`, `channel channel`, `status delivery_status DEFAULT 'pending'`, `attempts int DEFAULT 0`, `last_error text NULL`, `created_at`, `sent_at NULL` | `pk_notifications`, **`uq_notifications_feedback_channel`** UNIQUE(`private_feedback_id`,`channel`) — на неё ссылается `ON CONFLICT` приёма |
| `channel_bindings` | `id uuid`, `place_id → places`, `channel channel`, `chat_id text NULL`, `bind_token_hash bytea`, `bound_at NULL` | `pk_channel_bindings`, `uq_channel_bindings_place_channel` UNIQUE(`place_id`,`channel`) |
| `guest_events` | `id bigserial`, `place_id → places`, `kind guest_event_kind`, `platform platform NULL`, `device_hash bytea(16)`, `created_at` | `pk_guest_events`, `ck_guest_events_platform` CHECK(`(kind='public_door_click') = (platform IS NOT NULL)`). **UNIQUE НЕТ И БЫТЬ НЕ МОЖЕТ** — см. §4 |
| `public_review_counts` | `id uuid`, `place_id → places`, `observed_at date`, `count int`, `source review_count_source DEFAULT 'manual'` | `pk_public_review_counts`, `uq_public_review_counts_place_date` UNIQUE(`place_id`,`observed_at`) |
| `partners` | `id uuid`, `name text`, `promo_code text`, `status partner_status DEFAULT 'active'`, `payout_rate numeric`, `created_at` | `pk_partners`, `uq_partners_promo_code` UNIQUE(`promo_code`) |
| `attributions` | `id uuid`, `account_id → accounts`, `partner_id → partners`, `source attribution_source`, `status attribution_status DEFAULT 'pending'`, `expires_at`, `created_at` | `pk_attributions`, `uq_attributions_account` UNIQUE(`account_id`) WHERE `status <> 'rejected'` — у аккаунта одна действующая атрибуция |
| `commissions` | `id uuid`, `attribution_id → attributions`, `payment_event_id text`, `amount numeric`, `created_at` | `pk_commissions`, **`uq_commissions_payment_event`** UNIQUE(`payment_event_id`) — вторая, независимая от `webhook_events` гарантия «ровно один раз» |
| `checkout_sessions` | `id uuid`, `account_id → accounts`, `provider_session_id text`, `status checkout_status DEFAULT 'pending'`, `created_at` | `pk_checkout_sessions`, `uq_checkout_sessions_provider_session` UNIQUE(`provider_session_id`) |
| `subscriptions` | `id uuid`, `account_id → accounts`, `plan plan`, `places_limit int`, `current_period_end`, `status text` | `pk_subscriptions`, `uq_subscriptions_active_account` UNIQUE(`account_id`) WHERE `status='active'` |
| `webhook_events` | `provider text`, `event_id text`, `payload jsonb`, `processed_at` | **`pk_webhook_events`** PRIMARY KEY(`provider`,`event_id`). `event_id = '<тип события>:<id объекта>'` — у ЮKassa отдельного идентификатора события не существует, поэтому он составной и различает `payment.succeeded` и `payment.canceled` по одному платежу |
| `analytics_events` | `id bigserial`, `account_id uuid NULL`, `event_type text`, `metadata jsonb DEFAULT '{}'`, `created_at` | `pk_analytics_events`. **UNIQUE нет** — по той же причине, что у `guest_events` (§4): пишущие роли не имеют `SELECT`, и уникальный индекс сделал бы `ON CONFLICT` каналом чтения |
| `rate_limit_events` | `id bigserial`, `scope text`, `key text`, `created_at` | `pk_rate_limit_events`. UNIQUE нет |
| `audit_log` | `id bigserial`, `account_id uuid NULL`, `entity_type`, `entity_id`, `actor_id uuid NULL`, `action`, `reason NULL`, `created_at` | `pk_audit_log` |

## 3. Индексы

```sql
CREATE INDEX ix_guest_events_place_created      ON guest_events(place_id, created_at);
CREATE INDEX ix_private_feedback_place_created  ON private_feedback(place_id, created_at DESC);
CREATE INDEX ix_notifications_status_created    ON notifications(status, created_at);
CREATE INDEX ix_rate_limit_scope_key_created    ON rate_limit_events(scope, key, created_at);
CREATE INDEX ix_platform_links_place            ON platform_links(place_id);
```

**Индекса `guest_events(place_id, device_hash)` НЕТ, и это часть защиты, а не пропуск.**

## 4. Почему на `guest_events` не может быть UNIQUE

У `app_render` есть `INSERT` и нет `SELECT`. Два следствия, оба несущие:

- `INSERT … RETURNING` требует `SELECT`-привилегии на возвращаемые колонки — рендер не получает
  обратно даже собственную вставку;
- при отсутствии UNIQUE **невыразим `ON CONFLICT`** — а он и был бы каналом чтения: «строка уже
  была» = «гость уже приходил» = персонализация под постоянного гостя, то есть гейтинг по
  предсказанию в обход всех трёх слоёв.

Дедупликация устройств выполняется **при агрегации** под `app_owner`. Страж T8 утверждает отсутствие
UNIQUE; страж T11 — значения `guest_event_kind` и `ck_guest_events_platform`.

## 5. `device_hash`

```
device_hash = left( HMAC-SHA256(key = DEVICE_HASH_SECRET ‖ to_char(now(),'IYYY-IW'),
                                msg = place_id ‖ '\n' ‖ client_ip ‖ '\n' ‖ user_agent), 16 )
```

Считается в приложении, не в БД. Две границы области действия, обе обязательные: **неделя** (ротация
соли на границе ISO-недели) и **точка** (`place_id` в сообщении). Без `place_id` один телефон давал
бы одинаковый хэш в разных заведениях — сквозной идентификатор между точками, прямо запрещённый
FR-013 и NFR-DATA-001. Сырые IP и UA не сохраняются нигде; ретеншн `guest_events` — 90 дней.

**Страж T12 (по исходнику):** в вычислении `device_hash` участвуют И `place_id`, И номер недели.
Свойство несущее: без `place_id` метрика недели молча превращается в трекер посетителей между
заведениями, и никакой другой страж этого не заметит — числа остаются правдоподобными.

## 6. Роли и гранты

```sql
CREATE ROLE app_render  LOGIN;   -- apps/guest:      GET /r/:slug, /go/:slug/:platform, /r/:slug/private
CREATE ROLE app_intake  LOGIN;   -- services/intake: POST /api/feedback/private
CREATE ROLE app_notify  LOGIN;   -- services/notifier
CREATE ROLE app_owner   LOGIN;   -- apps/web

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_render, app_intake, app_notify;

-- ОДИН GRANT НА РОЛЬ В СТРОКЕ. Перечисление ролей через запятую запрещено: этот блок —
-- самое проверяемое место комплекта, и поиск по имени роли обязан отвечать правду.
-- Ни один комментарий здесь не повторяет форму `TO <роль>;` — иначе он даст ложное срабатывание.
GRANT SELECT (id, slug, name, branding_required)  ON places            TO app_render;
GRANT SELECT (id, slug, name)                     ON places            TO app_intake;
GRANT SELECT (place_id, platform, url, link_kind) ON platform_links    TO app_render;
GRANT INSERT                                      ON guest_events      TO app_render;
GRANT INSERT                                      ON private_feedback  TO app_intake;
GRANT INSERT                                      ON notifications     TO app_intake;
GRANT INSERT, SELECT                              ON rate_limit_events TO app_intake;
GRANT SELECT                                      ON private_feedback  TO app_notify;
GRANT SELECT, UPDATE (status, attempts, last_error, sent_at) ON notifications TO app_notify;
GRANT INSERT                                      ON analytics_events  TO app_notify;
GRANT INSERT                                      ON analytics_events  TO app_intake;
-- app_owner: ALL под RLS на своих таблицах; SELECT на private_feedback и guest_events под RLS
```

**`rate_limit_events` — единственная таблица, где роль читает собственные записи, и это названо
вслух.** Скользящее окно без `SELECT` не посчитать. Безопасно потому, что тональности в таблице нет,
а инвариант чистоты касается **рендера**: `app_intake` разметки не порождает. Условие, при котором
чтение не становится усилителем атаки, — в `Architecture-OPS.md` §7.2: грубая ступень работает **в
памяти процесса** и на отклонённом запросе к БД **не обращается вовсе**; до `rate_limit_events`
доходит только трафик, прошедший грубый отсев.

**`analytics_events` для `app_intake`: за что именно выдан.** Ровно два повода, оба — записи процесса
приёма, и оба редкие: **периодический сброс агрегата** грубого барьера (одна строка за интервал, не
строка на отказ) и **отказы порогов точки за барьером**, где `slug` уже резолвлен и привязка к точке
законна и полезна. Всё, что грубый барьер отбрасывает, в БД не попадает вовсе (`Architecture-OPS.md`
§7.2), поэтому право не превращает поток атакующего в нашу запись.

Условия те же, что у `guest_events` для рендера, и обеспечены конструкцией: **`INSERT` без `SELECT`**
(значит `INSERT … RETURNING` невозможен) и **отсутствие UNIQUE-индекса** (значит `ON CONFLICT` не
выразим и каналом чтения не станет). Защита здесь — не отсутствие права, а отсутствие `SELECT`: роль,
которая пишет и не читает, не может обусловить своё поведение тем, что записала. Симметрия с
`app_render` намеренная: это два анонимных пути, и права у них устроены одинаково.

**История этого гранта записана нарочно, потому что она — предупреждение.** Он был выдан под
формулировку «строка на каждое срабатывание», отозван вместе с ней (запись на каждый отказ делает
защиту усилителем атаки: запрос атакующему бесплатен, нам стоит записи в хранилище, общем с гостевой
страницей и оплатой) и выдан снова под два повода выше. Три редакции подряд предписывали **механизм**
— «писать на каждый отказ», «не давать права роли приёма», — и каждый раз механизм ломал соседнее
требование. Правильная форма требования здесь — **свойство**: отказ не стоит запроса к БД · пишущая
роль не может прочитать написанное · число видно оператору. Кто держит грант — решается здесь, в
архитектуре, а не в документе требований.

**Ни одной строки `GRANT … ON private_feedback TO app_render` не существует и существовать не может.**
Все три GET-пути обслуживает одна роль `app_render` — то есть `/go` и `/r/:slug/private` закрыты тем
же грантом, что и `/r/:slug`, а не отдельным послаблением.

## 7. Пулы соединений — по одному на контейнер

| Сервис | Переменная | Роль | `max` | `connectionTimeoutMillis` | `statement_timeout` |
|---|---|---|---|---|---|
| `apps/guest` | `DATABASE_URL_RENDER` | `app_render` | 10 | **2000** | **3000 ms** |
| `services/intake` | `DATABASE_URL_INTAKE` | `app_intake` | 5 | **2000** | **3000 ms** |
| `services/notifier` | `DATABASE_URL_NOTIFY` | `app_notify` | 3 | **2000** | 5000 ms |
| `apps/web` | `DATABASE_URL_OWNER` | `app_owner` | 10 | **2000** | 5000 ms |

`idleTimeoutMillis: 10000` у всех. **Числа живут здесь, и только здесь** — по разделу, о котором
договорились со `spec`: границы, обещанные пользователю (60 с доставки, ≤ 60 с инвалидации, пороги
частоты, длина текста), — предмет требования и живут в `Specification`; тюнинг ресурса — здесь.
В `NFR-SEC-004` осталось свойство без числа: «ожидание ресурса конечно и задано явно».

`connectionTimeoutMillis` обязателен: `pg.Pool` без него ждёт **бесконечно**, и недоступность БД
превращается из отказа в зависание — то есть в отказ, который никто не заметит.
