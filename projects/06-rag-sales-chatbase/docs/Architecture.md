# Architecture — N6 «Суфлёр», CJM H (временно)

**Версия:** 1.0 «как построено» · **Дата:** 2026-09-27 (первая редакция 0.1 — 2026-09-25) · **Канон:** [`canon.md`](canon.md) · **Решения:** [`ADR.md`](ADR.md)
· **Диаграммы C4:** [`C4_Diagrams.md`](C4_Diagrams.md).

## Architecture Overview

**Стиль:** Distributed Monolith в монорепо (Architecture Constraints пайплайна): один репозиторий,
npm workspaces, шесть сервисов Docker Compose на одной VPS (AdminVPS/HOSTKEY), прямой деплой
`docker compose up -d`. Хранилище — **PostgreSQL в контейнере с расширением pgvector**: вектора
живут в той же БД, что и аккаунты (никакой отдельной векторной БД и managed-сервисов).
AI-интеграция продукта — HTTP-вызовы шлюза OpenRouter из `web` и `worker-index`; MCP-серверы — для
агентов разработки (Phase 3), продукт их не требует.

**Что добавилось к редакции 0.1 (фичи 12–17 и исправления стенда, 26–27.09):** живая оплата ЮKassa (A-N6-040),
партнёрский учёт с комиссиями и выплатами (A-N6-043), удаление аккаунта со сторожем стирания (A-N6-054…065),
жизненный цикл источника и усечение по бюджету (A-N6-050…052), снятие HNSW (A-N6-051), статика вне предела двери
(A-N6-039), стенд на общем прокси машины с доменом `sufler.aicoding.space` (A-N6-037, A-N6-042).

```mermaid
flowchart LR
  subgraph Client
    OWN[Кабинет владельца<br/>Next.js, наш origin]
    HOST[Сайт клиента<br/>чужой origin]
    WID[Виджет в Shadow DOM<br/>widget.hash.js]
    HOST --> WID
  end
  subgraph Edge
    TLS[ai-hub-tls-proxy: Caddy 2.10<br/>sufler.aicoding.space, TLS]
    PX[proxy: Caddy 2.8 + ratelimit<br/>30/120 в мин, XFF, статика вне предела]
  end
  subgraph API
    WEB[web: Next.js 15<br/>кабинет, /api, /w/v1, /b]
    WRK[worker-index<br/>краулер, PDF, чанкинг, эмбеддинги]
  end
  subgraph Data
    DB[(db: Postgres 16 + pgvector 0.8.6)]
    RD[(redis 7.4: очередь BullMQ)]
    VOL[/том uploads: сырой PDF до индексации/]
    SP[/том model-spend: журнал попыток/]
  end
  OR[OpenRouter:<br/>embeddings + chat/completions]
  OWN --> TLS --> PX --> WEB
  WID -- CORS fetch --> TLS
  WEB --> DB
  WEB --> RD
  WRK --> RD
  WRK --> DB
  WEB --> VOL
  WRK --> VOL
  WEB --> OR
  WRK --> OR
  WRK -- HTTP GET, robots.txt --> INET[Сайты клиентов]
  WEB --> SP
  WRK --> SP
  YK[ЮKassa: платежи]
  WEB -- создание и перезапрос платежа --> YK
  YK -- уведомление /api/webhooks/yookassa --> TLS
```

## Component Breakdown

| Сервис compose | Образ / сборка | Ответственность | Порты |
|---|---|---|---|
| `proxy` | `proxy/Dockerfile` (xcaddy: Caddy 2.8 + `caddy-ratelimit`, образ `caddy:2.8-n6-ratelimit-<tag>`; модуль проверяется на сборке) | единственная дверь; лимит частоты 30 мутаций / 120 чтений в минуту на `{client_ip}` (донор N4), неизменяемая статика `/_next/static/*` и `/w/widget.*.js` вне предела чтений (A-N6-039); `X-Forwarded-For` ЗАМЕНЯЕТСЯ `{client_ip}`; кэш бандла ставит `web` (A-N6-034); НЕ ставит CORS и CSP | `"127.0.0.1:${N6_HTTP_PORT:-8086}:80"` — только к общему TLS-прокси; на стенде ещё сеть `talk-ai-public` (`compose.stand.yml`) |
| `web` | `apps/web` (Next.js 15, Node 22) | кабинет, API, предпросмотр, `/w/v1/*` для виджета, `/b/{slug}`, `/r/{code}`, `/invite/{token}`, раздача бандла; ответы RAG (эмбеддинг вопроса, поиск, модель, проверка цитат); оплата (`/api/checkout`, вебхук ЮKassa); партнёрка и студии; запрос удаления аккаунта; команды оператора `ops:*` | нет |
| `worker-index` | `apps/worker` | задачи индексации BullMQ: `CrawlSite`, `ExtractPdf`, `ChunkDocument`, `EmbedAndStore`; сторож раз в минуту: `stalled`, истечение оплаченных планов, стирание текста «не знаю» и истории, уборка тома `uploads`, стирание аккаунтов (`erasureTick`) — шаги изолированы (`watchdog-steps.ts`): сбой одного не останавливает остальные | нет |
| `db` | `pgvector/pgvector:0.8.6-pg16` | все данные, вектора `vector(1536)`; HNSW снят (A-N6-051), поиск — точный перебор внутри бота | нет (`expose` не требуется) |
| `redis` | `redis:7.4-alpine` | транспорт очереди; AOF, `noeviction`, пароль `${REDIS_PASSWORD:?}` | нет |
| `migrate` | `apps/web` (скрипт) | миграции SQL до старта `web`/`worker-index` (`service_completed_successfully`) | нет |

Пакеты монорепо: `apps/web`, `apps/worker`, `apps/widget` (бандл, сборка в `apps/web/widget-bundle/`, раздаёт `GET /w/[file]`),
`packages/db` (пул, миграции, `quota.ts`), `packages/rag` (чанкинг, промпт, `ValidateModelAnswer`,
клиент OpenRouter), `packages/queue` (BullMQ + fence, донор N5). Каждый сервис — `restart:
unless-stopped`, healthcheck, `depends_on: condition: service_healthy`; дополнительный compose-файл
тестов объявляет `name:` (compose-hygiene).

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 15 (App Router), дизайн-токены N5, шрифт Onest | донор N5 живёт на проде; тёмная тема и прибор адаптивности готовы (ADR-012) |
| Widget | TypeScript → один IIFE-бандл (esbuild), Shadow DOM, ≤ 45 КБ gzip | донор N1 `apps/widget` (ADR-013); без фреймворка — бюджет бандла |
| Backend | Node 22, Next.js route handlers, `pg` без ORM, zod | как N5; SQL нужен явный для pgvector и атомарных квот |
| Database | PostgreSQL 16 + pgvector 0.8.6; поиск — точный перебор `vector_cosine_ops` внутри бота (HNSW снят, A-N6-028/051) | вектора в НАШЕМ Postgres (постановка); ≤ 2000 измерений (ADR-001) |
| Cache/Queue | Redis 7.4 + BullMQ | донор N5 `packages/queue` с фенсом попыток (ADR-009) |
| AI | OpenRouter: `anthropic/claude-haiku-4.5` (ответы), `openai/text-embedding-3-small` (1536) | один шлюз, работающий из РФ-контура у N5 (ADR-002, ADR-011) |
| Parsing | undici (HTTP), собственный разбор robots.txt, `linkedom` + извлечение основного текста, `pdfjs-dist` | без браузера (ADR-010); PDF в процессе воркера |
| Payments | ЮKassa: провайдер, сети в коде, фейк — перенос из N4 (`apps/web/src/server/payments/*`); вебхук — форма N1 | решение владельца «оплату через ЮKassa взять из предыдущих проектов» (A-N6-040, ADR-019) |
| Infrastructure | Docker Compose, Caddy, VPS; стенд — за общим TLS-прокси машины `ai-hub-tls-proxy` | Architecture Constraints; ADR-023 |

## External Dependencies

Каждая способность, которая нужна продукту от чужого сервиса. Одна строка — одна СПОСОБНОСТЬ.
Доказательство — документация или машинный каталог самого поставщика, с датой и дословной цитатой.
Проверено агентом 2026-09-25 (WebFetch/curl из этой VPS).

| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |
|---|---|---|---|---|
| отдаёт эмбеддинги текста по HTTP API | OpenRouter, `POST /api/v1/embeddings` | [openrouter.ai/docs/api/reference/embeddings](https://openrouter.ai/docs/api/reference/embeddings) · проверено 2026-09-25 · «To generate embeddings, send a POST request to `/embeddings`» | CONFIRMED | FR-INDEX-002, FR-ANSWER-001 |
| предоставляет модель `openai/text-embedding-3-small` с выходом-эмбеддингом | OpenRouter, каталог `GET /api/v1/embeddings/models` | [openrouter.ai/api/v1/embeddings/models](https://openrouter.ai/api/v1/embeddings/models) · проверено 2026-09-25 · `"id":"openai/text-embedding-3-small"` и `"output_modalities":["embeddings"]` | CONFIRMED | FR-INDEX-002 |
| вектор `text-embedding-3-small` имеет длину 1536 (≤ 2000 для HNSW) | OpenAI, руководство по эмбеддингам | [developers.openai.com/api/docs/guides/embeddings](https://developers.openai.com/api/docs/guides/embeddings) · проверено 2026-09-25 · «By default, the length of the embedding vector is `1536` for `text-embedding-3-small` or `3072` for `text-embedding-3-large`.» | CONFIRMED | FR-INDEX-002, NFR-SCALE-001 |
| тарифицирует эмбеддинги за токен ($0,02 за 1 млн) | OpenRouter, каталог моделей | [openrouter.ai/api/v1/embeddings/models](https://openrouter.ai/api/v1/embeddings/models) · проверено 2026-09-25 · `"pricing":{"prompt":"0.00000002","completion":"0"}` | CONFIRMED | FR-LIMIT-003, `model-cost-contract.md` |
| отвечает моделью `anthropic/claude-haiku-4.5` через chat/completions | OpenRouter | [openrouter.ai/anthropic/claude-haiku-4.5](https://openrouter.ai/anthropic/claude-haiku-4.5) · проверено 2026-09-25 · «Model ID: `anthropic/claude-haiku-4.5`» и «POST https://openrouter.ai/api/v1/chat/completions» | CONFIRMED | FR-ANSWER-002 |
| принимает для этой модели структурированный ответ по схеме | OpenRouter, каталог `GET /api/v1/models` | [openrouter.ai/api/v1/models](https://openrouter.ai/api/v1/models) · проверено 2026-09-25 · `"response_format","stop","structured_outputs"` в `supported_parameters` модели `anthropic/claude-haiku-4.5` | CONFIRMED | FR-ANSWER-002 (проверку цитат делает наш код — ADR-003) |
| тарифицирует Haiku 4.5 за токены ($1 / $5 за 1 млн) | OpenRouter, каталог `GET /api/v1/models` | [openrouter.ai/api/v1/models](https://openrouter.ai/api/v1/models) · проверено 2026-09-25 · `"pricing":{"prompt":"0.000001","completion":"0.000005"` | CONFIRMED | FR-LIMIT-001, FR-LIMIT-002, `model-cost-contract.md` |
| отвечает на запросы с этой VPS (РФ-контур) | OpenRouter, проба с ключом | проверено 2026-09-25 · проба с ключом 21:19Z (A-N6-019): `POST https://openrouter.ai/api/v1/embeddings`, `openai/text-embedding-3-small`, `dimensions:1536` → HTTP 200, 1536 измерений, 6 токенов, $0.00000012 (ключ стенда N5, временный); ранее без ключа — HTTP 401 (сеть доступна) | CONFIRMED | FR-INDEX-002, FR-ANSWER-002 — сеть подтверждена; СВОЙ ключ N6 проверяет `EmbedProbe` при первом старте (Completion, шаг 3) |
| индексирует `vector` до 2000 измерений HNSW | pgvector (библиотека в нашем образе, не сервис) | [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector) · проверено 2026-09-25 · «Supported types are: `vector` - up to 2,000 dimensions» | CONFIRMED | FR-INDEX-002, ADR-001 |
| доставляет оповещение мониторинга оператору | Telegram Bot API `sendMessage` (как у N5) | не проверялось в этой фазе: это операционный канал, не функция продукта | UNCONFIRMED | Completion «Monitoring» (оповещения) — до подтверждения мониторинг читается вручную раз в сутки |
| принимает платежи и шлёт уведомления | ЮKassa: `POST /v3/payments`, `GET /v3/payments/{id}`, уведомления `payment.succeeded` / `refund.succeeded` на `https://sufler.aicoding.space/api/webhooks/yookassa` | код — перенос провайдера N4, проверенного тестовой оплатой на магазине N4 16–17.09 (reuse-inventory §2); у N6 СВОЕГО магазина нет — живой платёж не проводился (27.09) | UNCONFIRMED | FR-TARIFF-002 — работает в режиме `N6_PAYMENTS_MODE=off` (экран интереса); `live` включается ключами магазина (`scripts/stand-set-yookassa.sh`) |

Строка сетевой доступности — `CONFIRMED` по пробе A-N6-019 (обновлено после Phase 2, находка M1):
шлюз отвечает с этой VPS на ключ, но ключ был ЧУЖОЙ (стенд N5). «Сеть доступна» доказано, «ключ N6
работает» — ещё нет; поэтому требования этой строки в Phase 3 входят вместе с пробой при старте `worker-index` (`EmbedProbe`: один эмбеддинг «проба», проверка длины 1536 — иначе
процесс не стартует). N5 на этой же машине ходит к OpenRouter за chat/completions в проде
(reuse-inventory §6) — косвенный, не прямой довод.

## Payments, Partners and Erasure (добавлено 27.09)

**Платёжный контур (ADR-019, A-N6-040).** `POST /api/checkout` → строка `payment_intent` ДО обращения к провайдеру →
создание платежа ВНЕ транзакции → `201 { intent_id, redirect_url }` → форма ЮKassa → `/upgrade/return` опрашивает
`GET /api/checkout/{intent_id}` (пять различимых состояний). Уведомление `POST /api/webhooks/yookassa`: сырые байты ≤ 64 КиБ →
подлинность ВНЕ транзакции (адрес отправителя из XFF, записанного дверью, ∈ сети ЮKassa в коде; ПЕРЕЗАПРОС платежа;
сверка магазина, режима, суммы, статуса) → транзакция: `INSERT payment_event (provider, event_key) ON CONFLICT DO NOTHING`
(пусто — дубль, 200) → план и срок (`GREATEST(срок, now()) + 30 дней`, старший план) → `payment` (UNIQUE
`provider_payment_id`) → атрибуция `converted` → начисление партнёру. Недоступность ЮKassa — исключение: 503 без единой
записи, повтор проходит полным путём. Режим `N6_PAYMENTS_MODE`: `off` (по умолчанию, вебхук 404, экран интереса) ·
`fake` (тесты; в production — отказ старта) · `live`.

**Партнёрский учёт (ADR-020, A-N6-043).** Журнал `commission_entry` (`accrual | clawback | payout | write_off`), а не
счётчик баланса: начисление — внутри транзакции оплаты (20 % от полученного после удержания ЮKassa, 12 месяцев с первой
оплаты, холд 30 дней), сторно — внутри транзакции возврата (всегда на всё начисление), выплата — командой оператора
`ops:partner payout` (минимум 1 000 ₽, не больше созревшего, идемпотентна по метке). Баланс и «доступно» — одна функция
`partnerTotals` для живого и удалённого партнёра. Код партнёра (`/r/{code}` → подписанная cookie 30 дней), приглашение
студии (`/invite/{token}`, 7 дней, одноразовое, передача бота клиенту под той же блокировкой, что предел ботов).
Блокировки строк аккаунта — `FOR NO KEY UPDATE` (A-N6-048: `FOR UPDATE` давал взаимную блокировку с внешним ключом
журнала).

**Стирание аккаунта (ADR-021, A-N6-054…065).** `DELETE /api/account` (повторный ввод пароля вне транзакции) — одной
транзакцией: `account.status = 'erasing'`, срок 72 ч, сессии удалены, боты `deleted` (виджеты отвечают сразу 404/403),
приглашения аннулированы, коды заморожены. Сторож (`erasureTick`, ≤ 50 аккаунтов за проход, после часового тихого
периода): файлы PDF → строки данных → обезличивание записей оплат, начислений, выплат (хранятся 5 лет, 402-ФЗ) и
журналов → надгробие `deleted` ПОСЛЕДНИМ (почта `deleted:<id>`). Свободный текст оператора (причины в `partner_audit`,
`operator_action`) у стираемого/стёртого аккаунта обезличивают ТРИГГЕРЫ БД на вставку (миграция 010, разделы 7–8) и
проход стирания для старых строк; метка выплаты хранится только отпечатком `erased:<md5>` (префикс `erased:`
зарезервирован, `reserved_key`). Деньги партнёра при удалении НЕ сгорают — невыплаченное остаётся долгом
(`ops:erasure owed`), списание только `ops:erasure write-off` (решение владельца A-N6-061). Отмены нет.

**Жизненный цикл источника (ADR-022, A-N6-050…052).** «Обновить» и «Повторить» — та же задача (`index_job_id`), новая
серия с фенсом; неизменные страницы по `content_hash` не переэмбеддятся; исчезнувшие удаляются только после ПОЛНОГО обхода
(сбой sitemap или переполненная очередь — не удаляют). Предел запусков — 20 на бота в сутки (журнал `index_start`,
отказы считаются); бюджет серии источника 500 000 / 1 000 000 токенов; ≤ 300 фрагментов на страницу. Исчерпание
СОБСТВЕННОГО бюджета задачи или серии — усечение: `done` с `index_job.truncated_by` и честной пометкой «Прочитано N
страниц»; ноль страниц и внешние потолки — отказ `quota_refused`. Удаление источника — одной транзакцией со страницами,
фрагментами и задачами; порядок блокировок «задачи → бот» (без взаимной блокировки с воркером).

## Data Architecture

Логические поля — [`Pseudocode.md`](Pseudocode.md) «Data Structures»; здесь — только отображение на
хранилище, связи и индексы.

- Все сущности — таблицы одной схемы `public`; первичные ключи `uuid` (`gen_random_uuid()`),
  `created_at timestamptz DEFAULT now()`. Перечисления — `text` + `CHECK (col IN (…))`, чтобы закрытость
  набора держала БД, а не только код.
- `chunk.embedding` — `vector(1536)`; индекс `CREATE INDEX … USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)`; `SET hnsw.ef_search = 40` на сессию поиска. Поиск всегда с
  `WHERE bot_id = $1`: при малых ботах planner выберет индекс `(bot_id)` и точный перебор — это
  корректно и быстро (≤ 3000 фрагментов на бот); при большом боте — HNSW с пост-фильтром и
  `hnsw.iterative_scan = relaxed_order` (pgvector ≥ 0.8), чтобы фильтр не выедал результаты.
  **Поправка A-N6-028 (фича `chunk-embed`, 2026-09-26):** путь HNSW + фильтр + `iterative_scan` на прогоне
  вернул 0 из 3 своих фрагментов при 300 чужих ближайших; поиск реализован ТОЧНЫМ перебором внутри бота
  (`MATERIALIZED`-выборка по `bot_id`, 5001 фрагмент — 34 мс), индекс HNSW остаётся в схеме и поиском не
  используется. **Фича `source-lifecycle` (2026-09-26, A-N6-051):** индекс снят миграцией 008 — вставка платила
  ≈ 2,8 мс на фрагмент под транзакцией страницы за индекс, которым поиск не пользуется.
- Связи: `account 1—N bot`; `bot 1—N source 1—N page 1—N chunk`; `bot 1—N allowed_origin`,
  `widget_install (UNIQUE bot_id, origin)`, `question_log`, `visitor_session`; `index_job N—1 source`,
  `job_attempt N—1 index_job`; `attribution (UNIQUE account_id) N—1 partner_code`;
  `studio_invite N—1 bot`. Удаление бота каскадирует на источники, страницы, фрагменты, журналы.
- Уникальные ограничения, несущие атомарность: `index_job (bot_id, idempotency_key)`,
  `quota_counter (scope, scope_key, period)`, `growth_event (type, dedup_key)`,
  `account (email)`, `bot (public_key)`, `bot (public_slug)`, `studio_invite (token_hash)`.
- Лимиты потолков — НЕ колонки: параметры из окружения (канон §6). Сырой PDF — том `uploads`
  (не объектное хранилище, ADR-018), удаляется после индексации.
- Резервная копия: `pg_dump` раз в сутки в том `backups`, хранение 7 дней (Completion).
- **Таблицы после фич 12–17 (миграции 003–010):** оплата — `payment_intent`, `payment_event` (UNIQUE provider+event),
  `payment` (UNIQUE provider_payment_id), `operator_action`; партнёрка — `partner_code_use`, `commission_entry`
  (UNIQUE платёж+вид для начисления и сторно; UNIQUE партнёр+метка для выплаты), `partner_payout_details`, `partner_audit`;
  служебные — `index_start` (008), `erasure_audit`, `upload_orphan` (010). `account` получил `plan_source`,
  `plan_paid_until`, `erase_requested_at`, `erase_deadline`; `index_job` — `truncated_by` (009); `bot` —
  `answers_verified_at` (003; снимается триггером на вставку фрагментов, 004). Всего 30 таблиц + `_schema_migration`.
- Все миграции — только добавляющие; раннер (`packages/db/src/migrate.ts`) применяет недостающие по имени в порядке
  сортировки (на стенде 007 применилась после уже применённой 008 — допустимо, миграции независимы).

## Security Architecture

- **Аутентификация:** почта + пароль, bcrypt 10 вне транзакции, сессия 7 дней, в БД хэш токена,
  cookie `__Host-n6_session; HttpOnly; Secure; SameSite=Lax`; предпросмотр — отдельный HttpOnly-cookie
  с хэшем токена в БД.
- **Авторизация:** каждый маршрут кабинета проверяет владение ботом (`bot.account_id = session.account_id`
  или право чтения студии); поиск RAG фильтрует `bot_id` в том же SQL (NFR-SEC-001).
- **Виджет на чужой странице:** Shadow DOM; `textContent`; CORS — точный origin из списка бота, без
  cookie и без `*`; заголовок ставит только `web`; CSP хозяина без `unsafe-inline` (ADR-005).
- **Галлюцинация как угроза:** порог сходства ДО модели + проверка цитат ПОСЛЕ (ADR-003);
  фрагменты помечены как данные (prompt injection, FR-ANSWER-004).
- **Краулер:** SSRF-фильтр после DNS и на каждом перенаправлении, соединение по проверенному IP.
- **Шифрование:** TLS на общем прокси; секреты только в `.env` машины (`${VAR:?}`), не в образах;
  `OPENROUTER_API_KEY` никогда не уходит в браузер (ключ продукта — серверный; паттерн «ключ в
  IndexedDB» пайплайна к нему не применяется: ключ принадлежит нам, а не пользователю).
- **Хранилища:** `db` и `redis` без `ports:` (docker-ports Правило №0); `web` не публикуется мимо
  `proxy` (deployment-seams: иначе XFF от клиента обходит лимиты).
- **152-ФЗ:** текст вопросов только у `unknown`, 14 дней; IP — префикс; удаление аккаунта ≤ 72 ч (сторож, надгробие,
  триггеры обезличивания свободного текста — раздел «Payments, Partners and Erasure»).
- **Оплата:** подлинность уведомления ЮKassa (не подписано) = сеть отправителя из кода + перезапрос платежа + сверка;
  подлинность ДО записи ключа повторности; недоступность провайдера — исключение (урок N1, security-operation-order).
- **Контракты проверены по выданному адресу стенда (27.09):** `embed-contract.md` и `long-job-contract.md` — проверки
  дают 0; `webhook-contract.md` — честный код 2 (проверка пакета требует подписи, ЮKassa не подписывает).

## Scalability Considerations

- **Вертикально (неделя):** одна VPS 4 vCPU / 8 ГБ. 1 000 000 фрагментов × 1536 × 4 байта ≈ 6,1 ГБ
  векторов + HNSW — предел одной машины; до него — `shared_buffers` 2 ГБ.
- **Узкие места:** (1) модель ответа — p95 ≤ 6 с держит поставщик, не мы; (2) краулер намеренно
  медленный (1 с/страница); ОДНА задача индексации за раз (`concurrency: 1`, константа кода
  `apps/worker/src/index.ts` — вежливость краулера; справедливость между ботами держит суточный предел запусков
  `INDEX_STARTS_PER_BOT_DAY`, source-lifecycle); (3) вставка фрагментов — по странице, не пачкой на весь сайт;
  индекс HNSW снят миграцией 008 (поиск — точный перебор внутри бота, A-N6-028), страница ≤ 300 фрагментов.
- **Горизонтально (v1):** `web` масштабируется репликами (состояние в Postgres/Redis); квоты атомарны в
  БД, поэтому корректны на нескольких репликах. При росте векторов — `halfvec(1536)` (вдвое меньше,
  HNSW до 4000) без смены модели.

## Stand on this machine (добавлено 27.09, ADR-023)

Стенд `https://sufler.aicoding.space` (A-N6-042) — тот же `docker-compose.yml` плюс надстройка `compose.stand.yml`: дверь
входит в сеть `talk-ai-public` общего TLS-прокси машины `ai-hub-tls-proxy` (`/home/dz-projects-2026/edge`, Caddy 2.10,
держит 80/443 для N1–N5). Блок сайта `sufler.aicoding.space, n6.194.85.249.105.sslip.io { encode gzip zstd; header
X-Robots-Tag "noindex, nofollow"; reverse_proxy n6-sufler-proxy-1:80 }` вносит владелец (правка общего прокси —
чужой ресурс; файл смонтирован по inode — править на месте, не переименованием). Env стенда — вне git
(`/home/dz-projects-2026/.n6-stand/stand.env`, 600), потолки глобальных scope занижены. Запись A в DNS зоны
`aicoding.space` (Yandex Cloud) — `194.85.249.105`; первые минуты после создания часть резолверов отдаёт
закэшированный отказ (SOA minimum 900 с).

## Reconciliation with Pseudocode

Сверены сущности: `account`, `session`, `bot`, `allowed_origin`, `source`, `page`, `chunk`,
`index_job`, `job_attempt`, `preview`, `visitor_session`, `question_log`, `widget_install`,
`quota_counter`, `growth_event`, `partner_code`, `attribution`, `studio_invite`, `pro_interest`;
алгоритмы: все 34 блока `### Algorithm` из [`Pseudocode.md`](Pseudocode.md).

| Сущность.поле | Вид расхождения | Что сделано |
|---|---|---|
| `index_job.current_fence` | отсутствующая колонка | `RunIndexJob`, `EmbedAndStore`, `DeleteSource`, `WatchdogTick` читают и пишут fence, а в первой редакции Data Structures его не было — поле добавлено в Pseudocode (логический смысл) и в схему `bigint NOT NULL DEFAULT 0` |
| `quota_counter.scope` | несовпадение набора значений | `global_previews` в каноне несёт ДВА предела (предпросмотры и ответы предпросмотра) при одном scope — разведено на ключи `scope_key = 'previews'` и `'preview_answers'` при `scope = global_previews`; набор scope остаётся 10 |
| `quota_counter.scope` (preview_session) | один scope — два предела, общий счётчик | после Phase 2 (H1): `CreatePreview` и ответы предпросмотра списывали ОДНУ пару `(preview_session, сессия)` — создание съедало 1 из 10 ответов, SC-US-002-3 давал 9. Разведено на `scope_key = '<сессия>:create'` (1/сутки) и `'<сессия>:answers'` (10/сутки), у каждого своя переменная; у `global_previews` так же две переменные (`QUOTA_GLOBAL_PREVIEWS` / `QUOTA_GLOBAL_PREVIEW_ANSWERS`) — одно имя не держит два числа. Scope — 10, переменных — 14 (A-N6-020) |
| `question_log.text` | смена типа | логически «только у unknown» — физически `text NULL` + `CHECK (outcome = 'unknown' OR text IS NULL)`, чтобы инвариант держала БД |
| `bot.account_id` | смена типа | у `draft` владельца нет — колонка `NULL`-допустима, `CHECK (status = 'draft' OR account_id IS NOT NULL)` |
| `chunk.embedding` индекс | снят | HNSW терял свои фрагменты под фильтром (A-N6-028) и стоил ≈ 2,8 мс на вставку фрагмента — снят миграцией 008 (A-N6-051) |
| `index_job` | новая колонка | `truncated_by` — усечение по бюджету задачи или серии вместо отказа (миграция 009, A-N6-052) |
| `commission_entry.payout_key` | обезличивание | у стираемого/стёртого партнёра — только `erased:<md5>` (триггер миграции 010 + проход стирания); префикс `erased:` зарезервирован |
| `partner_audit.reason`, `operator_action.reason` | обезличивание | триггеры `BEFORE INSERT` миграции 010 заменяют свободный текст у `erasing`/`deleted` аккаунта |
