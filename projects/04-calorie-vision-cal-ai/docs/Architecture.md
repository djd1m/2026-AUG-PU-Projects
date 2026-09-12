# Architecture — N4 «Тарелка», CJM E

Дата: 2026-09-12. Источник имён — [`canon.md`](canon.md) (заморожен 2026-09-12): 12 сущностей, 10 маршрутов,
6 сервисов, числа потолков. Документ отвечает на выходы discovery **PD-DATA-001…003**, **PD-COST-001**,
**PD-ARCH-001** ([`product-discovery-brief.md`](product-discovery-brief.md) §M4).

Статус: технический план. Ни один сервис не развёрнут, ни одно измерение не снято на живом стенде —
там, где ниже стоит число, это проектное требование, а не наблюдение.

## Architecture Overview

**Стиль: Distributed Monolith (Monorepo).** Один репозиторий, общие типы и схема миграций, но три
самостоятельных процесса (`web`, `api`, `recognizer`), которые масштабируются и падают по отдельности.
Выбор объясняется двумя свойствами задачи: (1) распознавание — это внешний платный вызов длиной в
секунды, и он не должен занимать веб-воркер, отдающий страницы; (2) продукт на неделю, и стоимость
эксплуатации микросервисной сети здесь больше выигрыша от неё.

```mermaid
flowchart TB
    subgraph Client["Client"]
        PWA["PWA (браузер, камера)"]
        TMA["Telegram Mini App"]
    end
    subgraph Edge["Edge"]
        CADDY["proxy — Caddy<br/>единственная дверь, TLS, rate limit"]
    end
    subgraph App["API"]
        WEB["web — Next.js SSR<br/>PWA + TMA на одном фронте"]
        API["api — Fastify<br/>10 маршрутов /api/v1"]
        REC["recognizer — Node worker<br/>модель + RAG"]
    end
    subgraph Data["Data"]
        DB[("db — PostgreSQL 16<br/>данные + очередь заданий")]
        S3[("storage — MinIO<br/>приватный бакет фото")]
    end
    subgraph Ext["Внешние сервисы"]
        ANT["Anthropic Messages API<br/>Haiku 4.5 / Sonnet 5"]
        TG["Telegram Mini Apps"]
        USDA["USDA FoodData Central<br/>только при импорте базы"]
    end

    PWA --> CADDY
    TMA --> CADDY
    CADDY --> WEB
    CADDY --> API
    WEB --> API
    API --> DB
    API --> S3
    REC -->|"FOR UPDATE SKIP LOCKED"| DB
    REC --> S3
    REC --> ANT
    API -. "проверка initData" .-> TG
    USDA -. "разовый импорт, вне запроса пользователя" .-> DB
```

Кэша нет, брокера очередей нет — оба решения приняты осознанно и обоснованы в Technology Stack.

## Component Breakdown

| Сервис | Ответственность | Чего НЕ делает |
|---|---|---|
| **`web`** (Next.js, SSR + PWA-манифест + Telegram Mini App SDK) | экраны камеры, результата, расхождения, дневника, карточки, кабинета партнёра; публичная страница карточки `/c/{card_id}`; один фронт на оба клиента — TMA отличается только источником сессии | не ходит в БД и в MinIO напрямую; не знает секретов моделей |
| **`api`** (Node/TypeScript, Fastify) | 10 маршрутов канона; приём фото в MinIO; создание задания `recognition`; атомарная проверка потолков; проверка Telegram `initData`; применение кода партнёра; выдача presigned-URL | не вызывает модель сам — иначе долгий вызов занял бы HTTP-воркер |
| **`recognizer`** (Node worker) | забирает задание `SELECT … FOR UPDATE SKIP LOCKED`; вызывает Haiku 4.5 со структурированной JSON-схемой; ищет ингредиент в `food_item`/`food_synonym` (pg_trgm); считает числа по порции; при уверенности < 0,6 эскалирует к Sonnet 5; пишет результат и источник | не принимает HTTP-запросов извне вовсе |
| **`db`** (PostgreSQL 16 + `pg_trgm`) | данные, поиск по названию, очередь заданий, счётчики квот | не публикует порт на хост (`.claude/rules/docker-ports.md`, Правило №0) |
| **`storage`** (MinIO) | приватный бакет фото, TTL 30 дней политикой жизненного цикла | не отдаёт объекты публично — только presigned-URL с коротким сроком |
| **`proxy`** (Caddy) | TLS, единственная публичная дверь, ограничение частоты до валидации, заголовки CSP | не ставит CORS-заголовки: приложение и API живут на одном origin, и дублирование заголовка ломает CORS молча |

Код партнёра принимается **двумя путями**: по прямой ссылке Mini App (`?startapp=`) и вводом руками
после первого результата. Второй путь обязателен, а не запасной: у части пользователей ссылки `t.me`
не открываются, и путь, зависящий только от deeplink, теряет их молча.

Импортёр базы USDA — не сервис compose, а разовая задача (`npm run import:fdc`), потому что она
выполняется до запуска и не участвует в пользовательском пути.

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 15 (App Router, SSR), PWA-манифест, Telegram Mini Apps SDK | один фронт закрывает оба клиента канона; SSR нужен публичной карточке `/c/{card_id}` для превью в мессенджерах |
| Backend | Node 22 / TypeScript, Fastify | общий язык и типы с фронтом; Fastify даёт доступ к сырому телу запроса, что понадобится, если появятся вебхуки |
| Database | PostgreSQL 16 + расширение `pg_trgm` | одна база держит и данные, и очередь, и полнотекстовый поиск по названию продукта; `pg_trgm` даёт нечёткое совпадение «гречка отварная» ↔ `Buckwheat, cooked` через таблицу синонимов |
| Cache | **нет** | 3000 сканов/сутки ≈ 0,03 rps. Кэш на таком объёме не ускоряет ничего, но добавляет шестой сервис, второе место хранения истины и класс дефектов «устаревшее значение». Решение пересматривается, если нагрузка вырастет на два порядка |
| Queue | таблица `recognition` в PostgreSQL, выборка `FOR UPDATE SKIP LOCKED` | отдельный брокер (Redis/RabbitMQ) — это ещё одно хранилище, ещё один сервис и разъезд состояния между БД и очередью. `SKIP LOCKED` даёт ровно нужное: несколько воркеров, ни одного двойного захвата, аренда и повтор в той же транзакции, что и запись результата. Цена — опрос раз в секунду, что при 0,03 rps незаметно |
| Infrastructure | Docker Compose на VPS, Caddy как единственная дверь, MinIO для фото | требование Architecture Constraints конвейера; managed BaaS (Supabase/Firebase/Neon) запрещены |

## External Dependencies

Каждая способность, которая нужна продукту от чужого сервиса. Одна строка — одна СПОСОБНОСТЬ, а не
один поставщик: «принимает изображение» и «возвращает JSON по схеме» — два разных вопроса, и
поставщик может уметь одно без другого.

| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |
|---|---|---|---|---|
| принимает изображение в теле запроса и анализирует его | Anthropic Messages API (vision) | [platform.claude.com/docs/en/build-with-claude/vision](https://platform.claude.com/docs/en/build-with-claude/vision) · проверено 2026-09-12 · «On the API, provide images to Claude as `image` content blocks using one of three source types» | CONFIRMED | FR-CAPTURE-002, FR-RECOGNIZE-001 |
| возвращает ответ, обязанный соответствовать заданной JSON-схеме | Anthropic Messages API (structured outputs) | [platform.claude.com/docs/en/build-with-claude/structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) · проверено 2026-09-12 · «Structured outputs guarantee schema-compliant responses through constrained decoding» | CONFIRMED | FR-RECOGNIZE-001, FR-RECOGNIZE-002 |
| отдаёт расход и токены по организации за период | Anthropic Usage & Cost Admin API | [platform.claude.com/docs/en/manage-claude/usage-cost-api](https://platform.claude.com/docs/en/manage-claude/usage-cost-api) · проверено 2026-09-12 · «The Usage & Cost Admin API provides programmatic and granular access to historical API usage and cost data for your organization» | CONFIRMED | NFR-OPS-001, FR-LIMIT-002 |
| ищет продукт по ключевым словам | USDA FoodData Central API, `GET /v1/foods/search` | [fdc.nal.usda.gov/api-guide/](http://fdc.nal.usda.gov/api-guide/) · проверено 2026-09-12 · «Returns a list of foods that matched search (query) keywords» | CONFIRMED | FR-SOURCE-001, FR-SOURCE-003 |
| отдаёт нутриенты одной записи по её идентификатору | USDA FoodData Central API, `GET /v1/food/{fdcId}` | [fdc.nal.usda.gov/api-guide/](http://fdc.nal.usda.gov/api-guide/) · проверено 2026-09-12 · «Fetches details for one food item by FDC ID» | CONFIRMED | FR-SOURCE-001, FR-SOURCE-002 |
| право использовать данные FDC в закрытом коммерческом продукте (CC0) | USDA FoodData Central, раздел Licensing | [fdc.nal.usda.gov/api-guide/](http://fdc.nal.usda.gov/api-guide/) · проверено 2026-09-12 · «USDA FoodData Central data are in the public domain and they are not copyrighted» и далее «No permission is needed for their use, but we request that users list FoodData Central as the source of the data» | CONFIRMED | FR-SOURCE-001, FR-SOURCE-002, FR-SOURCE-003 |
| проверка подлинности данных, полученных от Mini App | Telegram Mini Apps (`initData`) | [core.telegram.org/bots/webapps](https://core.telegram.org/bots/webapps) · проверено 2026-09-12 · «You can verify the integrity of the data received by comparing the received hash parameter with the hexadecimal representation of the HMAC-SHA-256 signature» | CONFIRMED | FR-AUTH-002 |
| открытие Mini App по прямой ссылке с параметром | Telegram Mini Apps (direct link) | [core.telegram.org/bots/webapps](https://core.telegram.org/bots/webapps) · проверено 2026-09-12 · «You can use direct links to open a Mini App directly in the current chat» | CONFIRMED | FR-AUTH-002, FR-PARTNER-001 |

**Лицензия подтверждена, и у неё есть последствие в требованиях.** Раздел Licensing страницы
`api-guide` прямо помещает данные FDC в общественное достояние под CC0 1.0, поэтому использование в
закрытом коммерческом продукте разрешено без отдельного согласия. Взамен USDA просит называть
источник, и предложенная им цитата — «U.S. Department of Agriculture, Agricultural Research Service.
FoodData Central, 2019. fdc.nal.usda.gov.» — записана как требование атрибуции в **FR-SOURCE-002**
(видимый источник числа). То есть строка «источник» на экране результата закрывает не только
продуктовое обещание, но и просьбу правообладателя данных.

Проверено дважды: тот же факт независимо подтверждён записью data.gov
([catalog.data.gov/dataset/fooddata-central](https://catalog.data.gov/dataset/fooddata-central),
поле License = `https://www.usa.gov/publicdomain/label/1.0/`, метаданные сверены 2026-09-10).

**Ограничение, которое надо знать до планирования наблюдаемости.** Usage & Cost Admin API объявлен
недоступным для индивидуальных аккаунтов («The Admin API is unavailable for individual accounts»,
та же страница, 2026-09-12). Если организация не заведена, NFR-OPS-001 закрывается собственным
журналом расхода, а не консолью поставщика.

**Чего в этом списке нет и почему.** В пользовательском пути к USDA обращений НЕТ: база
импортируется в `food_item` заранее. Это снимает и лимит FDC («a default rate of 1,000 requests per
hour per IP address», та же страница), и зависимость распознавания от доступности чужого сервиса.

## Data Architecture

12 логических сущностей канона отображаются на 12 таблиц один к одному. У каждой `id UUID PRIMARY KEY`
и `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`; второго списка полей здесь нет — логическая модель
принадлежит `Pseudocode.md`, здесь только физика.

| Сущность | Таблица | Физические решения |
|---|---|---|
| `account` | `account` | появляется только после входа через Telegram; до него пользователь живёт в `device_session`. Колонка `status` — enum из 3 значений `active / erasing / erased`: удаление по запросу длится до 72 часов, и всё это время строка обязана существовать в состоянии «удаляется», иначе повторный запрос не отличить от выполненного |
| `device_session` | `device_session` | анонимная сессия устройства; связывается с `account` при входе, не заменяется. Хранится **хэш** токена cookie (`cookie_token_hash`), а не сам токен: утечка дампа базы не должна выдавать действующие сессии. Адрес хранится **усечённым префиксом** (`ip_prefix`), не полным адресом — квоте и anti-fraud префикса достаточно, а полный адрес создал бы обязательство без нужды. Индекс по `anonymous_diary_expires_at` для еженедельной уборки анонимных дневников |
| `photo` | `photo` | в БД только ключ объекта MinIO и метаданные; байты — в бакете, TTL 30 дней. Колонки `expires_on date` и `file_state` (enum `present / purged`) плюс частичный индекс `(expires_on) WHERE file_state = 'present'` — без него суточная уборка просматривает всю таблицу целиком. Строка после уборки **сохраняется** в состоянии `purged`: удаление строки оставило бы дневник со ссылкой на пустоту |
| `recognition` | `recognition` | **и запись результата, и строка очереди**; `status` — enum из 4 значений `queued / done / failed / refused`; `failure_reason` — enum из 6 значений, nullable. Колонка `leased_until` и частичный индекс `(status, leased_until) WHERE status = 'queued'`; выборка задания — `WHERE status = 'queued' AND (leased_until IS NULL OR leased_until < now()) … FOR UPDATE SKIP LOCKED`. Предикат именно такой, см. разбор под таблицей |
| `food_item` | `food_item` | импорт FDC; `GIN (name_en gin_trgm_ops)` для нечёткого поиска; `UNIQUE (source, source_id)` — повторный импорт не двоит записи; `import_snapshot_date` хранит дату снимка базы и попадает в каждый `Snapshot` |
| `food_synonym` | `food_synonym` | ручная RU-курация 100–300 блюд. Две взаимоисключающие формы: прямая ссылка `food_item_id` либо разложение на компоненты `recipe_parts` с долями (борщ не становится безымянным числом). `CHECK` на строгое ИЛИ: заполнено ровно одно из двух, иначе запись молча читалась бы как пустая. Индекс `GIN (name_ru_normalized gin_trgm_ops)` — **по нормализованной форме**, потому что поиск идёт по ней |
| `diary_entry` | `diary_entry` | частичный индекс `(owner_key, eaten_on) WHERE deleted_at IS NULL` — дневник всегда читается за один день, а удаление мягкое, и итог дня обязан считаться без удалённых; дата хранится как `date` в Europe/Moscow, не как момент времени. Тот же индекс обслуживает перенос анонимного дневника на аккаунт одной транзакцией при входе |
| `share_card` | `share_card` | `id` — публичный неугадываемый идентификатор (UUIDv4), он же адрес `/c/{card_id}`. Колонка `revoked_at`: отзыв согласия закрывает уже опубликованные карточки, и срок на это — 60 секунд |
| `partner` | `partner` | партнёров десятки, индексов сверх ключа не нужно |
| `partner_code` | `partner_code` | `UNIQUE (code)` в верхнем регистре — иначе два партнёра получают один код |
| `attribution` | `attribution` | `UNIQUE (device_session_id)` — **ровно одна** атрибуция на устройство; `status` — enum из 3 значений `pending / activated / rejected`, `source` — enum из 3 значений `explicit / deeplink / cookie`. Уникальность гарантирует единственность строки, но НЕ её неизменность: правило приоритета `explicit > deeplink > cookie` живёт в коде и потому обязано иметь физическую опору — колонку `source`, без которой сравнивать нечего |
| `scan_quota_counter` | `scan_quota_counter` | `UNIQUE (scope, scope_key, day)`, где `scope` ∈ `user / global`; увеличение только через `INSERT … ON CONFLICT DO UPDATE SET used = counter.used + 1 WHERE counter.used < :limit RETURNING used` |

**Аренда задания: `SKIP LOCKED` перестаёт защищать ровно там, где закрывается транзакция.** Оба
документа по отдельности правы, и дефект живёт в их конъюнкции. `Pseudocode.md` верно требует
закрыть транзакцию аренды ДО внешнего вызова, иначе десять одновременных сканов выбирают пул
соединений (`shared-resource-verification`). Первая редакция этого документа столь же верно
утверждала, что `FOR UPDATE SKIP LOCKED` не допускает двойного захвата. Вместе: как только
транзакция закрыта, строка снова видна как `queued`, блокировки на ней больше нет, и следующий
воркер законно забирает ТО ЖЕ задание — второй платный вызов на то же фото. Поэтому единственное,
что разделяет воркеров после закрытия транзакции, — это `leased_until`, и он обязан входить И в
предикат выборки, И в индекс. Проверяется конкурентным прогоном, последовательный тест здесь
зеленеет при обеих реализациях.

**Счётчик квот — единственное место, где нельзя писать «прочитать и записать».** Проверка и
инкремент выполняются одним оператором с `RETURNING`: пустой результат означает «предел достигнут»,
и вызов модели не делается. Последовательный тест такой защиты зеленеет при обеих реализациях;
различает их только конкурентный прогон, поэтому он обязателен
(`.claude/rules/shared-resource-verification.md`).

**Фото.** Приватный бакет, объекты недоступны без подписи; жизненный цикл бакета удаляет объект
через 30 дней, строка `photo` при этом переводится в состояние «файла больше нет» — иначе дневник
начнёт ссылаться на пустоту.

**Источник числа.** У `recognition` и `diary_entry` хранится ссылка на `food_item` и снимок
использованных чисел. Снимок нужен потому, что переимпорт базы меняет значения, а дневник за
прошлый вторник обязан остаться тем, что пользователь видел.

## Security Architecture

- **Анонимная сессия.** `device_session_id` живёт в cookie `HttpOnly; Secure; SameSite=Lax`. Значение
  не угадываемо (≥ 128 бит энтропии); в JavaScript не читается — фронту оно и не нужно. В базе
  лежит только его хэш, сырое значение не хранится нигде.
- **Адрес клиента хранится усечённым.** Квоте и anti-fraud достаточно префикса, поэтому полный адрес
  не записывается ни в `device_session`, ни в аудит блокировок: данные, которых нет, не утекают.
- **Вход через Telegram.** `initData` проверяется в `api` (не во фронте: значение, проверенное на
  клиенте, не проверено), и порядок четырёх свойств — часть защиты, а не стиль: подпись считается
  **до разбора** полезной нагрузки, **по сырым байтам** строки проверки (разбор и повторная сборка
  меняют байты, подпись не сойдётся никогда, и обычным «лечением» этого становится отключение
  проверки), сравнением **постоянного времени**, и лишь затем проверяется свежесть `auth_date` — не
  старше 24 часов. Свежесть после подписи, иначе разное время ответа на «протухло» и «подпись не
  сошлась» различимо снаружи.
- **Публичная карточка не кэшируется.** Отзыв согласия обязан закрыть уже опубликованный адрес
  `/c/{card_id}` за 60 секунд, а кэш на прокси или CDN сделал бы этот срок недостижимым: страница
  продолжала бы отдаваться после отзыва. Caddy отдаёт `/c/*` с `Cache-Control: no-store`, и
  `revoked_at` читается на каждом запросе. Удалённая карточка, отозванное согласие и неизвестный
  идентификатор дают ОДИН и тот же `404` без содержимого.
- **Порядок операций — это и есть защита.** Ограничение частоты работает **до** валидации тела
  (иначе перебор мусорными запросами бесплатен), проверка квоты — **до** вызова модели и атомарно,
  согласие — **до** первой записи в дневник.
- **Секреты.** Ключ Anthropic и токен бота — только в окружении `api` и `recognizer`. У `web` их нет,
  и это проверяемо: сервис, который не должен звать модель, не имеет чем.
- **Фото приватны.** Отдаются исключительно presigned-URL с коротким сроком, выдаваемым владельцу
  сессии. Прямого публичного пути к бакету нет.
- **Данные о питании — специальная категория персональных данных.** Согласие берётся до первой записи
  дневника, а не при установке; удаление по запросу удаляет дневник, фото и распознавания. Публичной
  страницы дня в MVP нет — публикуется только карточка, которую пользователь создал сам.
- **CORS не нужен и не настраивается.** `web` и `api` живут за одним Caddy на одном origin. Заголовок
  `Access-Control-Allow-Origin` не ставит ни приложение, ни прокси: два одинаковых заголовка ломают
  CORS молча, и `curl` этого не показывает (`.claude/rules/deployment-seams.md`).
- **CSP.** Mini App исполняется внутри WebView Telegram; политика запрещает инлайновые скрипты и
  ограничивает `connect-src` собственным origin и `frame-ancestors` доменами Telegram.
- **Никакой публикации портов хранилищ.** `db` и `storage` доступны только по именам в сети compose.

## Scalability Considerations

Целевая нагрузка канона — **3000 сканов/сутки**, то есть ≈ 0,03 запроса в секунду в среднем и
порядка 0,5 rps в пиковый обеденный час. Это не нагрузка для инфраструктуры; узкое место одно и оно
внешнее.

| Узел | Запас | Что делать при росте |
|---|---|---|
| **Внешний вызов модели** | единственное настоящее ограничение: латентность 2–5 с и лимиты поставщика | горизонтально добавлять `recognizer`; `SKIP LOCKED` этого не замечает |
| `recognizer` | масштабируется копиями без изменения кода | увеличить число реплик; аренда задания уже в транзакции |
| `api` | сотни rps на одном процессе при такой логике | реплики за Caddy |
| `db` | один экземпляр, вертикально | 3000 строк/сутки — это годы до необходимости партиционирования |
| `storage` | 3000 фото/сутки × 30 дней ≈ 90 000 объектов | политика TTL держит объём постоянным |

Горизонтально масштабируются `web`, `api` и `recognizer`. PostgreSQL остаётся один: реплика для
чтения при 0,03 rps добавила бы задержку репликации и класс дефектов «прочитали устаревшее»,
не решая ни одной существующей проблемы.

## Reconciliation with Pseudocode

Выполнена 2026-09-12 по `Pseudocode.md` (423 строки). Прочитаны две секции целиком: `## Data
Structures` и `## Core Algorithms`. Сверены **12 сущностей** — `account`, `device_session`, `photo`,
`recognition`, `food_item`, `food_synonym`, `diary_entry`, `share_card`, `partner`, `partner_code`,
`attribution`, `scan_quota_counter` — и **17 алгоритмов**: `CreateDeviceSession`,
`CheckAndConsumeQuota`, `EnqueueScan`, `RecognizeScan`, `AdjustPortion`, `ReplaceIngredient`,
`ResolveDiscrepancy`, `CommitDiaryEntryAndDayTotals`, `ComputeSoftStreak`, `BuildShareCard`,
`ApplyPartnerCode`, `AntiFraudOnCode`, `PartnerDashboard`, `TelegramLogin`, `ConsentAndErasure`,
`RecordProInterest`, `PurgeExpiredPhotos`.

Алгоритмы читались наравне со структурами не для полноты: одни структуры не показывают чтения или
записи отсутствующего поля. Девять из одиннадцати находок ниже видны только из алгоритма.

**Наборы значений совпали и расхождением не являются:** `recognition.status` — ровно 4
(`queued / done / failed / refused`), `attribution.status` — ровно 3
(`pending / activated / rejected`), как в [`canon.md`](canon.md) §4.

Найдено 11 расхождений: 10 исправлено здесь, 1 требует правки `Pseudocode.md` (чужой файл, не
трогал).

| Сущность.поле | Вид расхождения | Что сделано |
|---|---|---|
| `recognition.leased_until` | отсутствующая колонка | Добавлена колонка и переписан предикат выборки: `WHERE status = 'queued' AND (leased_until IS NULL OR leased_until < now()) … FOR UPDATE SKIP LOCKED`, индекс `(status, leased_until) WHERE status = 'queued'`. Самая дорогая находка сверки: `RecognizeScan` шаг 2 закрывает транзакцию аренды ДО внешнего вызова, после чего `SKIP LOCKED` не защищает ничего, и второй воркер забирает то же задание — второй платный вызов на то же фото. Разбор под таблицей Data Architecture |
| `photo.expires_on`, `photo.file_state` | отсутствующая колонка | Обе добавлены (`file_state` — enum `present / purged`) плюс частичный индекс `(expires_on) WHERE file_state = 'present'`. `PurgeExpiredPhotos` читает и пишет оба поля; без индекса суточная уборка просматривает всю таблицу |
| `food_synonym.name_ru_normalized` | отсутствующая колонка | Колонка добавлена, индекс триграмм перенесён на неё. Было `GIN (name_ru …)`, а `RecognizeScan` шаг 7 ищет по нормализованной форме — индекс существовал и не использовался бы |
| `food_synonym.recipe_parts` | отсутствующая колонка | Добавлена вместе с `CHECK` на строгое ИЛИ между ней и `food_item_id`. Без разложения на компоненты «борщ» не имеет представления в схеме вовсе |
| `food_item.name_en` | отсутствующая колонка | Колонка в схеме называлась `name`, алгоритмы читают `name_en`; исправлено имя в схеме и в индексе `GIN (name_en gin_trgm_ops)` |
| `attribution.source` | отсутствующая колонка | Добавлен enum `explicit / deeplink / cookie`. Заодно исправлено утверждение о `UNIQUE (device_session_id)`: он гарантирует ЕДИНСТВЕННОСТЬ строки, а не её неизменность — прежняя формулировка «делает код сильнее cookie неотменяемым» приписывала ограничению свойство, которого у него нет, и правило приоритета осталось бы без физической опоры |
| `account.status` | отсутствующая колонка | Добавлен enum `active / erasing / erased`: `ConsentAndErasure` даёт удалению до 72 часов, и всё это время состояние «удаляется» обязано быть выразимо |
| `share_card.revoked_at` | отсутствующая колонка | Добавлена; следом в Security Architecture запрет кэширования `/c/*` (`Cache-Control: no-store`), иначе объявленные 60 секунд на закрытие опубликованной карточки недостижимы физически |
| `device_session.cookie_token_hash` | смена типа | Хранится хэш токена, а не сам токен. Раздел безопасности говорил только о свойствах cookie и допускал хранение сырого значения |
| `device_session.ip_prefix` | смена типа | Усечённый префикс вместо полного адреса — и в сессии, и в аудите anti-fraud. Записано также в Security Architecture |
| `attribution` — 409 против замены | **требует правки `Pseudocode.md`** | Не исправлял: расхождение логическое, а логика принадлежит `Pseudocode.md`. `ApplyPartnerCode` шаг 4 требует, чтобы явно введённый код ЗАМЕНЯЛ атрибуцию от слабого источника, а API-контракт маршрута 7 в том же документе возвращает `409 already_attributed`. Для случая «на устройстве атрибуция из cookie, человек вводит код руками» оба правила выполнить нельзя. Передано координатору |

Физическая часть дополнительно уточнена без расхождения: индекс `diary_entry` сделан частичным
(`WHERE deleted_at IS NULL`), потому что удаление мягкое, а итоги дня считаются без удалённых;
у `device_session` добавлен индекс по `anonymous_diary_expires_at` под недельную уборку анонимных
дневников; у `food_item` названа колонка `import_snapshot_date`, попадающая в каждый `Snapshot`.

Порядок операций из алгоритмов совпал с разделом Security Architecture и правку не потребовал:
ограничение частоты до валидации, квота после валидации и до вызова модели, согласие до первой
записи дневника, свежесть `auth_date` после проверки подписи.
