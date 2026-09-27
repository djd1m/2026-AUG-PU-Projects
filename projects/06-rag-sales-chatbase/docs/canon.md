# Канон Phase 1 — «Суфлёр» (N6, клон Chatbase)

Замороженный источник имён и чисел для всех документов Phase 1. Документы ссылаются на эти
идентификаторы, перечисления и числа и не выдумывают свои (PR-005: канон — ДО написания документов).
Дата заморозки: 2026-09-25. Владелец канона — координатор Phase 1 (агент, автономный режим,
A-N6-012). Изменение канона = новая редакция с датой и перечнем затронутых документов.

**Редакция 2026-09-27 «как построено»** (после фич 1–17, исправлений стенда и A-N6-001…065): канон сверен с кодом —
миграциями 001–010, деревом маршрутов `apps/web/src/app`, `docker-compose.yml`, `.env.example`, константами
`packages/rag/src/{constants,commission}.ts`. Где канон и код расходились, исправлен канон; расхождения перечислены в
конце этого файла («Сверка с кодом 27.09»).

## 1. Продукт и границы

- **Имя:** «Суфлёр» (рабочее, A-N6-003; товарный знак не проверялся). **Адрес стенда:** `https://sufler.aicoding.space`
  (решение владельца A-N6-042; старое имя `n6.194.85.249.105.sslip.io` оставлено в прокси).
  **Клиент:** веб-приложение (Next.js) на своём домене + встраиваемый виджет (отдельный бандл) на
  ЧУЖИХ сайтах. **Контур:** Россия/СНГ, интерфейс и ответы на русском (PD-GEO-001).
- **CJM:** H = ядро A (badge) + демо-страница из C + партнёрский минимум из B —
  **ВРЕМЕННО** (A-N6-008, ждёт владельца; [`discovery/CJM_Variants.md`](discovery/CJM_Variants.md)).
- **Входит (неделя):** URL сайта → краулинг в пределах хоста → PDF → чанкинг с контекстом →
  эмбеддинги 1536 в pgvector → чат с RAG, где КАЖДЫЙ ответ несёт ссылку на фрагмент → «не знаю» +
  контакт при отсутствии фрагмента → предпросмотр до регистрации → код `<script>` → виджет в Shadow
  DOM → бейдж на free (решает сервер) → учёт установок на внешних доменах → демо-страница
  `/b/<slug>` (noindex) → код партнёра/студии → кабинет студии: несколько ботов + перенос бота
  клиенту приглашением → потолки платных вызовов для анонимов → экран тарифов + экран интереса.
- **НЕ входит:** передача оператору, мультиязычность, аналитика диалогов (кроме счётчиков
  «ответил / не знал» и списка вопросов без ответа), интеграции с CRM, обучение на диалогах,
  выбор модели пользователем, OCR сканов, рендер JS-сайтов браузером, скриншот сайта в
  предпросмотре, замена нашего знака на знак студии (white-label), рассылки, стриминг ответа. С 26.09 решением
  владельца В НЕДЕЛЮ перенесены приём денег (ЮKassa, A-N6-040) и комиссии с выплатами партнёрам (A-N6-043).

## 2. Семейства идентификаторов (ровно 7)

| Семейство | Форма | Где объявляется | Назначение |
|---|---|---|---|
| Пользовательские истории | `US-nnn` | Specification §5 | три цифры, не переиспользуются |
| Сценарии приёмки | `SC-US-nnn-k` | Specification §5 | Gherkin под историей, k от 1 |
| Функциональные | `FR-<ОБЛАСТЬ>-nnn` | Specification §2 `###` | области ниже |
| Нефункциональные | `NFR-<ОБЛАСТЬ>-nnn` | Specification §6 `###` | PERF, SEC, SCALE, OPS |
| Growth | `FR-GROWTH-001…007` | Specification §3 | семя брифа, токены точные |
| Look | `FR-LOOK-001…014` | Specification §4 | промоушен профиля: принять / отклонить с причиной |
| Решения | `ADR-nnn` | ADR.md | у каждого — Confirmation |

Манифест Phase 0 (`PD-*-nnn`) — в [`product-discovery-brief.md`](product-discovery-brief.md);
каждый идентификатор получает ответ в Specification §9.

Области FR (ровно 10): `SOURCE` (сайт и PDF), `INDEX` (чанкинг, эмбеддинги, задача индексации),
`ANSWER` (поиск, ответ, источник, «не знаю»), `WIDGET` (скрипт, изоляция, CORS, CSP), `PREVIEW`
(бот до регистрации), `BOT` (кабинет, код установки, установки, демо-страница, сводка), `TARIFF`
(планы, бейдж, экран интереса), `LIMIT` (потолки), `PARTNER` (коды, студии, перенос бота), `AUTH`
(вход, удаление).

## 3. Требования — заголовки (Specification обязана объявить каждый)

FR-SOURCE-001 краулинг сайта в пределах хоста · FR-SOURCE-002 вежливость и защита краулера
(robots.txt, пауза, бюджет, SSRF) · FR-SOURCE-003 загрузка PDF · FR-INDEX-001 чанкинг с контекстом
· FR-INDEX-002 эмбеддинги 1536 через шлюз и HNSW · FR-INDEX-003 задача индексации: идентификатор до
начала, три состояния, продолжение при повторе · FR-INDEX-004 переиндексация и удаление источника
(Should) · FR-ANSWER-001 поиск фрагментов с порогом · FR-ANSWER-002 ответ только по фрагментам со
ссылкой на источник · FR-ANSWER-003 «не знаю» + контакт · FR-ANSWER-004 фрагменты — данные, не
инструкции · FR-ANSWER-005 бот представляется ботом · FR-WIDGET-001 один `<script>`, Shadow DOM,
бюджет бандла · FR-WIDGET-002 CORS по списку доменов бота · FR-WIDGET-003 работа под CSP хозяина ·
FR-WIDGET-004 плашка источника · FR-PREVIEW-001 бот из URL до регистрации · FR-PREVIEW-002
сохранение бота при регистрации · FR-BOT-001 настройки бота (контакт, приветствие) · FR-BOT-002 код
установки и список доменов · FR-BOT-003 учёт установок · FR-BOT-004 сводка «ответил / не знал» ·
FR-TARIFF-001 три плана, бейдж решает сервер · FR-TARIFF-002 экран тарифов и экран интереса ·
FR-TARIFF-003 пределы плана · FR-LIMIT-001 потолки ответов для посетителей · FR-LIMIT-002 потолки
предпросмотра · FR-LIMIT-003 потолки эмбеддингов индексации · FR-LIMIT-004 ненастроенный потолок
валит старт · FR-PARTNER-001 код партнёра, атрибуция до оплаты · FR-PARTNER-002 кабинет студии и
перенос бота · FR-PARTNER-003 анти-фрод · FR-AUTH-001 регистрация и вход · FR-AUTH-002 удаление
аккаунта и данных.

Итого: 34 FR областей + 7 FR-GROWTH = **41 FR**; NFR — 9 (§6 Specification).

## 4. Сущности и закрытые перечисления

Сущности (логическая модель — Pseudocode, физическая — Architecture): `account`, `session`,
`bot`, `allowed_origin`, `source`, `page`, `chunk`, `index_job`, `job_attempt`, `preview`,
`visitor_session`, `question_log`, `widget_install`, `quota_counter`, `growth_event`,
`partner_code`, `attribution`, `studio_invite`, `pro_interest`; с 26.09 (живая оплата ЮKassa, решение владельца,
A-N6-040, миграция 006) — ещё 4: `payment_intent`, `payment_event`, `payment`, `operator_action`; с 26.09 (партнёры и студии,
комиссии и выплаты, решение владельца, A-N6-043, миграция 007) — ещё 4: `partner_code_use`, `commission_entry`,
`partner_payout_details`, `partner_audit`. Итого **27**. Служебные журналы (НЕ сущности канона, закрытый список, сверяется
`tests/enums.test.ts` и `tests/database.integration.test.ts`): `index_start` (запуски индексации для суточного предела,
миграция 008, A-N6-050), `erasure_audit` (журнал стирания без ПДн, миграция 010), `upload_orphan` (файл PDF удалённого
источника до стирания, миграция 010); плюс `_schema_migration` раннера миграций. Всего таблиц в схеме — 30 + `_schema_migration`. Закрытые перечисления партнёрки: `commission_entry.kind` ∈
`accrual | clawback | payout | write_off` (`write_off` — списание долга удалённому партнёру ТОЛЬКО командой оператора, A-N6-061; при удалении ничего не сгорает); `partner_code.frozen_reason` ∈
`antifraud_ip_burst | operator | owner_erased`; `partner_code_use.source` =
`attribution.source` ∈ `code | invite | cookie`; `partner_audit.kind` ∈ `frozen_antifraud | unfrozen | code_issued |
payout_recorded | accrual_skipped_fee_unknown | debt_written_off` (последнее — миграция 010, A-N6-061).

| Поле | Значения (закрыто) | Чтение неизвестного значения |
|---|---|---|
| `account.plan` | `free` · `nobadge` · `studio` | `free` (бейдж обязателен) |
| `account.status` | `active` · `erasing` · `deleted` | `deleted` (доступа нет) |
| `account.plan_source` | `none` · `payment` · `operator` | истекает ТОЛЬКО `payment` (A-N6-040) |
| `payment_intent.status` | `created` · `succeeded` · `canceled` | «выполняется» на экране возврата |
| `bot.status` | `draft` · `active` · `deleted` | `deleted` (виджет не отвечает) |
| `source.kind` | `site` · `pdf` | отказ |
| `source.status` | `pending` · `indexing` · `ready` · `failed` | `failed` |
| `index_job.status` | `queued` · `running` · `done` · `failed` | `failed` |
| `index_job.failure_reason` | `robots_disallowed` · `unreachable` · `blocked_address` · `no_text` · `not_pdf` · `too_large` · `no_text_layer` · `quota_refused` · `embedding_unavailable` · `stalled` · `internal` | `internal` |
| `question_log.outcome` | `answered` · `unknown` · `refused_limit` · `refused_origin` | `unknown` |
| `quota_counter.scope` | 10 значений, §7 | отказ списания |
| `growth_event.type` | `badge_impression` · `badge_click` · `share_cta_shown` · `share_cta_click` · `widget_install` · `first_answer` · `public_page_view` · `invite_sent` · `invite_accepted` · `interest` | не записывается |
| `attribution.source` | `code` · `invite` · `cookie` | `cookie` (самый слабый) |
| `attribution.status` | `pending` · `converted` · `rejected` · `partner_deleted` (A-N6-054) | `rejected` |
| `payment.status` | `succeeded` · `refunded` | — (пишет только вебхук) |
| `payment.review_reason` | `amount_mismatch` · `refund` · `unknown_intent` · `account_erasing` | `needs_review = (review_reason IS NOT NULL)` — план не выдаётся |
| `payment_event.provider` | `yookassa` · `fake` (`fake` в production — отказ старта) | отказ |
| `operator_action.action` | `set_plan` | отказ |
| `pro_interest.origin_screen` | `pricing` · `upgrade` · `install` · `cabinet` | отказ |
| `index_job.truncated_by` | `embed_budget` · `series_embed_budget` · `NULL` (не усечена) | — (A-N6-052) |
| `index_start.kind` | `site` · `pdf` · `retry` · `reindex` | отказ |
| `job_attempt.status` | `running` · `done` · `failed` | `failed` |
| `erasure_audit.event` | `requested` · `waiting_payout` · `payout_owed` · `erased` · `failed` · `overdue` | — (журнал, без ПДн) |

## 5. Маршруты (имена, не форма — форма в Pseudocode «API Contracts»; сверено с `apps/web/src/app` 27.09)

Вход и аккаунт: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`,
`DELETE /api/account` (`{ confirm: true, password }` → `202 { accepted, erase_deadline }`, A-N6-054).
Боты: `GET|POST /api/bots`, `PATCH /api/bots/{bot_id}`, `POST /api/bots/{bot_id}/sources` (JSON сайта или multipart PDF,
`Idempotency-Key`), `POST /api/bots/{bot_id}/origins`, `POST /api/bots/{bot_id}/ask` (тестовый чат владельца),
`POST /api/bots/{bot_id}/verify` (отметка «проверено», A-N6-035), `POST /api/bots/{bot_id}/publish` (демо-страница),
`GET /api/bots/{bot_id}/summary`, `POST /api/bots/{bot_id}/question-log/erase` (стирание журнала вопросов бота, FR-AUTH-002),
`POST /api/bots/{bot_id}/invite` (приглашение «Передать клиенту», фича 15).
Источники и задачи: `DELETE /api/sources/{source_id}`, `POST /api/sources/{source_id}/reindex` («Обновить» / «Повторить»,
та же задача), `GET /api/index-jobs/{index_job_id}`.
Оплата (A-N6-040): `POST /api/interest`, `POST /api/checkout`, `GET /api/checkout/{intent_id}`; ЕДИНСТВЕННЫЙ вебхук —
`POST /api/webhooks/yookassa` (без cookie; при `N6_PAYMENTS_MODE=off` — `404`).
Партнёры и студии: `GET /api/partner/summary`, `POST /api/partner/payout-details`, `GET /api/studio/summary`,
`POST /api/invites/{token}/accept`.
Предпросмотр (без входа; идентификатор — `index_job_id`): `POST /api/preview`, `GET /api/preview/{index_job_id}`,
`POST /api/preview/{index_job_id}/ask`, `POST /api/preview/{index_job_id}/claim`, `POST /api/preview/{index_job_id}/share`.
Виджет (чужой origin): `GET /w/v1/config?bot={public_key}`, `POST /w/v1/ask?bot={public_key}`, `POST /w/v1/event`,
`OPTIONS` для них; бандл `GET /w/widget.<hash>.js` (маршрут `/w/[file]`, старый хэш получает текущий бандл, A-N6-034).
Публичные: `/b/{slug}` (демо-страница), `/r/{code}` (код партнёра → cookie, 302), `/invite/{token}` (приём
приглашения), `/?from={domain}` (вход по бейджу), `/health`.
Экраны: `/`, `/pricing`, `/login`, `/preview`, `/preview/{index_job_id}`, `/upgrade`, `/upgrade/return`, `/dashboard`,
`/dashboard/bots/{bot_id}`, `/dashboard/bots/{bot_id}/install`, `/dashboard/partner`, `/dashboard/studio`,
`/dashboard/account` (удаление), `/account/erased` (квитанция удаления).
Команды оператора (в контейнере `web`): `npm run ops:set-plan`, `npm run ops:partner -- issue|unfreeze|payout|due|export`,
`npm run ops:erasure -- list|overdue|owed|write-off`.

## 6. Сервисы compose (ровно 6) и окружение

`proxy` (Caddy 2.8 + `caddy-ratelimit`, единственная дверь, `127.0.0.1:${N6_HTTP_PORT:-8086}` на хосте — только к общему
TLS-прокси), `web` (Next.js 15: кабинет, API, публичные страницы, раздача бандла виджета), `worker-index` (краулер + PDF +
чанкинг + эмбеддинги + сторож; BullMQ), `db` (`pgvector/pgvector:0.8.6-pg16`, без `ports:`), `redis` (`redis:7.4-alpine`,
без `ports:`, AOF, `noeviction`), `migrate` (одноразовый, миграции). Бандл виджета собирается на этапе сборки образа
`web` (`apps/widget` → `apps/web/widget-bundle/`, НЕ `public/`; раздаёт маршрут `GET /w/[file]`, A-N6-034).

**Стенд этой машины** (A-N6-037, A-N6-042): надстройка `compose.stand.yml` добавляет двери сеть `talk-ai-public` общего
TLS-прокси `ai-hub-tls-proxy` (`/home/dz-projects-2026/edge`, Caddy 2.10, 80/443); блок сайта
`sufler.aicoding.space, n6.194.85.249.105.sslip.io { reverse_proxy n6-sufler-proxy-1:80 }`; env стенда — вне git
(`/home/dz-projects-2026/.n6-stand/stand.env`, 600). Основной `docker-compose.yml` от стенда не зависит.

Переменные БЕЗ значения по умолчанию (`${VAR:?}`, отказ старта): `N6_PUBLIC_ORIGIN`, `N6_DB_PASSWORD` (из него compose
собирает `DATABASE_URL`), `REDIS_PASSWORD` (→ `REDIS_URL`), `OPENROUTER_API_KEY`, `SESSION_SECRET`, `ANSWER_MODEL`,
`EMBED_MODEL`, все четырнадцать переменных потолков §7 (`QUOTA_*`; scope — 10, переменных — 14).
Оплата (только `web`): `N6_PAYMENTS_MODE` ∈ `off | fake | live` — не задана → `off` (экран интереса), явно пустая или
неизвестная → отказ старта, `fake` при `NODE_ENV=production` → отказ; `YOOKASSA_SHOP_ID` (десятичный),
`YOOKASSA_SECRET_KEY`, `YOOKASSA_TEST_MODE` (строго `true|false`) — обязательны только при `live`
(`apps/web/src/server/payments/config.ts`; ввод на стенде — `scripts/stand-set-yookassa.sh`).
Со значением по умолчанию (не секреты, правятся под машину): `N6_COMPOSE_PROJECT` (`n6-sufler`), `N6_HTTP_PORT` (`8086`),
`IMAGE_TAG` (`dev`). `N6_INDEX_CONCURRENCY` снята (фича 16: код её не читал).

## 7. Числа (единый источник)

**Модели:** ответы — `anthropic/claude-haiku-4.5` через OpenRouter (A-N6-010), `temperature 0`,
`max_tokens 400`, structured outputs; эмбеддинги — `openai/text-embedding-3-small` через OpenRouter,
**1536 измерений** (A-N6-009). Цены на 2026-09-25 (каталог OpenRouter): Haiku 4.5 — $1 / $5 за
1 млн входных / выходных токенов; 3-small — $0,02 за 1 млн токенов.

**Поиск и ответ:** фрагмент — цель 500 токенов, потолок 600, перекрытие 80; к тексту фрагмента
приписан контекст «заголовок страницы › цепочка заголовков»; `top_k = 4`; порог косинусного
сходства `min_similarity = 0.40` (гипотеза, калибруется на наборе 20 + 20 вопросов, §Refinement);
история диалога в контексте — 2 предыдущих хода; ответ ≤ 400 токенов.

**Оплата (решения владельца 26.09, A-N6-040):** разовая оплата на **30 дней** без автопродления (`PAID_PLAN_DAYS`);
цены в копейках — `nobadge` **99 000**, `studio` **490 000** (`PLAN_PRICE_MINOR`, «цены предварительные» рядом с каждой
ценой); план = старший из оплаченных, срок = `GREATEST(срок, now()) + 30 дней`; сумма ≠ цене намерения — платёж на
разбор оператору, план не выдаётся; возврат — вручную оператором; истёкший оплаченный план сторож возвращает в `free`,
план оператора не истекает. Подлинность уведомления: адрес отправителя (XFF, записанный дверью) ∈ сети ЮKassa из кода
(`apps/web/src/server/payments/origin.ts`) + перезапрос платежа у ЮKassa + сверка (магазин, режим, сумма, статус).
Ключ повторности — `(provider, event:object.id)` с уникальным индексом.

**Партнёры и студии (решение владельца 26.09, A-N6-043):** комиссия **2000 б.п. = 20 %** от суммы после удержания ЮKassa,
**12 месяцев** с первой оплаты клиента, округление вниз; холд **30 дней**; выплата **5-го** числа по Москве по СБП, минимум
**1 000 ₽** (меньшее — перенос); анти-накрутка — **> 20** применений кода с одного префикса за **10 минут** → заморозка;
self-referral — владелец кода с того же префикса за **24 ч**; приглашение студии — **7 дней**, одноразовое; cookie реферала —
**30 дней**. Код: `packages/rag/src/commission.ts`, `packages/db/src/partners.ts`, `packages/db/src/studio.ts`.

**Краулер:** только хост введённого URL (и `www.`-вариант), `robots.txt` читается ДО первой
страницы, пауза 1000 мс, 1 поток на сайт, таймаут страницы 15 с, потолок страницы 2 МБ, только
`text/html`; запрет адресов частных сетей (SSRF). PDF: ≤ 10 МБ, ≤ 100 страниц, только с текстовым
слоем.

**Жизненный цикл источника (фича `source-lifecycle`, числа — константы кода `packages/rag/src/constants.ts`, не
окружение):** запусков индексации на бота в сутки МСК — **20** (`INDEX_STARTS_PER_BOT_DAY`: создание сайта или PDF,
«Повторить», «Обновить»; отказавшие считаются); токенов эмбеддингов на серию одного источника — **500 000** на free,
**1 000 000** на платных планах (`SOURCE_EMBED_BUDGET_BY_PLAN`); фрагментов на страницу или лист PDF — **300**
(`CHUNKS_PER_PAGE_MAX`, остаток не эмбеддится, `page.chunks_dropped`). «Обновить» — та же задача, неизменные
страницы по `content_hash` не перечитываются, исчезнувшие удаляются только после полного обхода.

**Планы (гипотеза цен, A-N6-004):**

| План | Ботов | Страниц на бота | PDF на бота | Ответов в месяц на бота | Ответов в сутки на бота | Бейдж | Цена-гипотеза |
|---|---|---|---|---|---|---|---|
| `free` | 1 | 50 | 3 | 300 | 50 | ОБЯЗАТЕЛЕН | 0 ₽ |
| `nobadge` | 1 | 300 | 10 | 3000 | 300 | нет | 990 ₽/мес |
| `studio` | 10 | 300 | 10 | 3000 | 300 | наш бейдж у клиентских ботов на free-клиентах | 4 900 ₽/мес |

**Потолки (`quota_counter.scope` — ровно 10 значений; переменных окружения `QUOTA_*` — ровно 14; сутки — `Europe/Moscow`).** Scope, несущий больше одного предела, разводится по `scope_key` (суффикс вида предела), и у КАЖДОГО предела своя переменная — одно имя не держит два числа (A-N6-020, закрывает H1/M2 отчёта Phase 2):

| scope | Ключ (`scope_key`) | Предел | Переменная |
|---|---|---|---|
| `visitor_answers` | `visitor_session` | 20 ответов/сутки | `QUOTA_VISITOR_ANSWERS` |
| `ip_answers` | префикс IP /24 (IPv6 /48) | 60 ответов/сутки | `QUOTA_IP_ANSWERS` |
| `bot_day_answers` | `bot_id` | по плану: free 50 / платные 300 | `QUOTA_BOT_DAY_FREE`, `QUOTA_BOT_DAY_PAID` |
| `bot_month_answers` | `bot_id` | по плану: free 300 / платные 3000 | `QUOTA_BOT_MONTH_FREE`, `QUOTA_BOT_MONTH_PAID` |
| `global_answers` | `all` | 3000 ответов/сутки | `QUOTA_GLOBAL_ANSWERS` |
| `preview_session` | `<сессия браузера>:create` | 1 предпросмотр/сутки | `QUOTA_PREVIEW_SESSION_CREATE` |
| `preview_session` | `<сессия браузера>:answers` | 10 ответов/сутки (создание их НЕ расходует) | `QUOTA_PREVIEW_SESSION_ANSWERS` |
| `ip_previews` | префикс IP | 3 предпросмотра/сутки | `QUOTA_IP_PREVIEWS` |
| `global_previews` | `previews` | 200 предпросмотров/сутки | `QUOTA_GLOBAL_PREVIEWS` |
| `global_previews` | `preview_answers` | 1000 ответов предпросмотра/сутки | `QUOTA_GLOBAL_PREVIEW_ANSWERS` |
| `account_embed_tokens` | `account_id` | 2 000 000 токенов/сутки | `QUOTA_ACCOUNT_EMBED` |
| `global_embed_tokens` | `all` | 20 000 000 токенов/сутки | `QUOTA_GLOBAL_EMBED` |

Предпросмотр: ≤ 20 страниц, ≤ 120 000 токенов эмбеддингов (решение владельца 27.09, A-N6-053; было 40 000) (константы кода в `index_job.page_budget`/`embed_budget`, не `quota_counter`; эмбеддинги предпросмотра дополнительно списывают `global_embed_tokens`), живёт 24 ч до сохранения. Исчерпание бюджета задачи (120 000) или серии источника после прочитанной страницы — усечение: `done` с `index_job.truncated_by` (`embed_budget` | `series_embed_budget`), а не отказ; ноль страниц — отказ `quota_refused` (A-N6-052).

Перечень переменных (14): `QUOTA_VISITOR_ANSWERS`=20, `QUOTA_IP_ANSWERS`=60, `QUOTA_BOT_DAY_FREE`=50, `QUOTA_BOT_DAY_PAID`=300, `QUOTA_BOT_MONTH_FREE`=300, `QUOTA_BOT_MONTH_PAID`=3000, `QUOTA_GLOBAL_ANSWERS`=3000, `QUOTA_PREVIEW_SESSION_CREATE`=1, `QUOTA_PREVIEW_SESSION_ANSWERS`=10, `QUOTA_IP_PREVIEWS`=3, `QUOTA_GLOBAL_PREVIEWS`=200, `QUOTA_GLOBAL_PREVIEW_ANSWERS`=1000, `QUOTA_ACCOUNT_EMBED`=2000000, `QUOTA_GLOBAL_EMBED`=20000000. Проверка старта — 14 отдельных прогонов, по одному на ИМЯ переменной, не на scope.

**Худший суточный расход при всех потолках:** 3000 × ≈ $0,0051 + 1000 × ≈ $0,0051 + 22 млн × $0,02/млн (индексация + предпросмотр)
≈ **$20,9 в сутки** (оценка ответа: ≈ 3100 входных + ≤ 400 выходных токенов).

**Виджет:** бандл ≤ 45 КБ gzip (сборка падает выше); пузырь 56 px, отступ 16 px; бейдж — ссылка
`/?from=<домен>&utm_source=badge`. **Установка** = origin ≠ `N6_PUBLIC_ORIGIN`, из списка бота,
запросивший конфигурацию И получивший ≥ 1 ответ посетителю.

**Метрика недели:** 15 установок на внешних доменах (A-N6-005, гипотеза). i — клики по бейджу на
1000 показов; conv% — доля кликнувших, получивших первый ответ своего бота.

**Сроки жизни:** сессия 7 дней; приглашение студии 7 дней, одноразовое; `question_log.text`
хранится только у `unknown`, 14 дней; сырой PDF удаляется после индексации; удаление аккаунта —
≤ 72 ч.

**Удаление аккаунта (фича `account-erasure`, решения владельца A-N6-054, константы `packages/rag/src/constants.ts`):**
срок стирания — **72 ч** от запроса (`ERASE_DEADLINE_HOURS`); тихий час до первой попытки — **1 ч** (`ERASURE_QUIET_MS`);
ожидание выплаты партнёру доступного ≥ **1 000 ₽** — до **6 ч** до срока (`ERASURE_PAYOUT_MARGIN_HOURS`), не выплаченное
к запасу остаётся долгом, а не сгорает (A-N6-056); НИЧЕГО из денег партнёра при удалении не сгорает — холд и суммы < 1 000 ₽ тоже долг, списание только `ops:erasure write-off` (A-N6-061); аккаунтов за проход сторожа — **50** (`ERASURE_BATCH`);
квитанция `__Host-n6_erasure` — **7 дней**; записи оплат, начислений и выплат — **5 лет** обезличенными (402-ФЗ).
Отмены нет. Оператор: `npm run ops:erasure -- list | overdue | owed`.

**Дверь (`proxy/Caddyfile`):** 30 мутаций и 120 чтений в минуту на `{client_ip}` ДО тела; неизменяемая статика
(`/_next/static/*`, `/w/widget.*.js`) вне предела чтений (A-N6-039: холодная загрузка страницы — 9 запросов, 8 из них
статика; офис за NAT получал 429); `X-Forwarded-For` ЗАМЕНЯЕТСЯ `{client_ip}`; CORS и CSP дверь не ставит.

**Задача индексации:** предельное время 15 мин; таймаут посредника 60 с; не более 2 автоматических
попыток шага; сторож — раз в минуту, `stalled` после 5 мин без обновления.

## Сверка с кодом 27.09 (что было в каноне неверно и исправлено)

| Место | Было | Стало (факт кода) |
|---|---|---|
| §4 таблицы | 27 сущностей + `index_start` | + `erasure_audit`, `upload_orphan` (миграция 010) — служебные |
| §4 `partner_audit.kind` | без `debt_written_off` | с `debt_written_off` (миграция 010) |
| §4 перечисления | не описаны `payment.*`, `operator_action.action`, `pro_interest.origin_screen`, `index_job.truncated_by`, `index_start.kind`, `job_attempt.status`, `erasure_audit.event` | описаны по CHECK миграций |
| §5 | `POST /api/studio/invites` | `POST /api/bots/{bot_id}/invite` |
| §5 | `/api/preview/{preview_token}` | `/api/preview/{index_job_id}` (+ `/share`) |
| §5 | нет `/api/bots/{id}/ask`, `/verify`, `/question-log/erase`, `/api/partner/*`, `/api/studio/summary`, `/health`, экранов | добавлены |
| §5 | `POST /w/v1/ask` | `POST /w/v1/ask?bot={public_key}` (бот в адресе, CheckOrigin до тела, A-N6-035) |
| §6 | `${HTTP_PORT:-8086}` | `127.0.0.1:${N6_HTTP_PORT:-8086}` |
| §6 | бандл → `apps/web/public/w/` | `apps/web/widget-bundle/` (A-N6-034) |
| §6 | `DATABASE_URL` как переменная окружения | `N6_DB_PASSWORD`; `DATABASE_URL` собирает compose |
| §6 | переменных оплаты нет | `N6_PAYMENTS_MODE`, `YOOKASSA_*` |
| §3 FR-INDEX-002 | «эмбеддинги 1536 … и HNSW» | индекс HNSW снят миграцией 008 (A-N6-051): поиск — точный перебор внутри бота (A-N6-028); заголовок FR правит владелец Specification |

