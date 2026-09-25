# Канон Phase 1 — «Суфлёр» (N6, клон Chatbase)

Замороженный источник имён и чисел для всех документов Phase 1. Документы ссылаются на эти
идентификаторы, перечисления и числа и не выдумывают свои (PR-005: канон — ДО написания документов).
Дата заморозки: 2026-09-25. Владелец канона — координатор Phase 1 (агент, автономный режим,
A-N6-012). Изменение канона = новая редакция с датой и перечнем затронутых документов.

## 1. Продукт и границы

- **Имя:** «Суфлёр» (рабочее, A-N6-003; доступность имени и домена не проверялась).
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
  предпросмотре, замена нашего знака на знак студии (white-label), приём денег (ЮKassa — спящий
  код, A-N6-011), выплаты партнёрам, рассылки, стриминг ответа.

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
`partner_code`, `attribution`, `studio_invite`, `pro_interest`.

| Поле | Значения (закрыто) | Чтение неизвестного значения |
|---|---|---|
| `account.plan` | `free` · `nobadge` · `studio` | `free` (бейдж обязателен) |
| `account.status` | `active` · `erasing` · `deleted` | `deleted` (доступа нет) |
| `bot.status` | `draft` · `active` · `deleted` | `deleted` (виджет не отвечает) |
| `source.kind` | `site` · `pdf` | отказ |
| `source.status` | `pending` · `indexing` · `ready` · `failed` | `failed` |
| `index_job.status` | `queued` · `running` · `done` · `failed` | `failed` |
| `index_job.failure_reason` | `robots_disallowed` · `unreachable` · `blocked_address` · `no_text` · `not_pdf` · `too_large` · `no_text_layer` · `quota_refused` · `embedding_unavailable` · `stalled` · `internal` | `internal` |
| `question_log.outcome` | `answered` · `unknown` · `refused_limit` · `refused_origin` | `unknown` |
| `quota_counter.scope` | 10 значений, §7 | отказ списания |
| `growth_event.type` | `badge_impression` · `badge_click` · `share_cta_shown` · `share_cta_click` · `widget_install` · `first_answer` · `public_page_view` · `invite_sent` · `invite_accepted` · `interest` | не записывается |
| `attribution.source` | `code` · `invite` · `cookie` | `cookie` (самый слабый) |
| `attribution.status` | `pending` · `converted` · `rejected` | `rejected` |

## 5. Маршруты (имена, не форма — форма в Pseudocode «API Contracts»)

Кабинет: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`,
`DELETE /api/account`, `GET|POST /api/bots`, `PATCH /api/bots/{bot_id}`,
`POST /api/bots/{bot_id}/sources`, `DELETE /api/sources/{source_id}`,
`POST /api/sources/{source_id}/reindex`, `GET /api/index-jobs/{index_job_id}`,
`POST /api/bots/{bot_id}/origins`, `GET /api/bots/{bot_id}/summary`,
`POST /api/bots/{bot_id}/publish`, `POST /api/studio/invites`, `POST /api/invites/{token}/accept`,
`POST /api/interest`.
Предпросмотр (без входа): `POST /api/preview`, `GET /api/preview/{preview_token}`,
`POST /api/preview/{preview_token}/ask`, `POST /api/preview/{preview_token}/claim`.
Виджет (чужой origin): `GET /w/v1/config?bot={public_key}`, `POST /w/v1/ask`,
`POST /w/v1/event`, бандл `GET /w/widget.<hash>.js`.
Публичные страницы: `/b/{slug}` (демо-страница), `/r/{code}` (код партнёра), `/?from={domain}`
(вход по бейджу).

## 6. Сервисы compose (ровно 6) и окружение

`proxy` (Caddy 2.8, единственная дверь, `${HTTP_PORT:-8086}` на хосте только за общим TLS-прокси),
`web` (Next.js 15: кабинет, API, публичные страницы, раздача бандла виджета), `worker-index`
(краулер + PDF + чанкинг + эмбеддинги; BullMQ), `db` (`pgvector/pgvector:0.8.6-pg16`, без `ports:`),
`redis` (`redis:7.4-alpine`, без `ports:`, AOF, `noeviction`), `migrate` (одноразовый, миграции).
Бандл виджета собирается на этапе сборки образа `web` (`apps/widget` → `apps/web/public/w/`).

Переменные БЕЗ значения по умолчанию (`${VAR:?}`): `N6_PUBLIC_ORIGIN`, `DATABASE_URL`,
`REDIS_PASSWORD`, `OPENROUTER_API_KEY`, `SESSION_SECRET`, `ANSWER_MODEL`, `EMBED_MODEL`, все
десять потолков §7 (`QUOTA_*`).

## 7. Числа (единый источник)

**Модели:** ответы — `anthropic/claude-haiku-4.5` через OpenRouter (A-N6-010), `temperature 0`,
`max_tokens 400`, structured outputs; эмбеддинги — `openai/text-embedding-3-small` через OpenRouter,
**1536 измерений** (A-N6-009). Цены на 2026-09-25 (каталог OpenRouter): Haiku 4.5 — $1 / $5 за
1 млн входных / выходных токенов; 3-small — $0,02 за 1 млн токенов.

**Поиск и ответ:** фрагмент — цель 500 токенов, потолок 600, перекрытие 80; к тексту фрагмента
приписан контекст «заголовок страницы › цепочка заголовков»; `top_k = 4`; порог косинусного
сходства `min_similarity = 0.40` (гипотеза, калибруется на наборе 20 + 20 вопросов, §Refinement);
история диалога в контексте — 2 предыдущих хода; ответ ≤ 400 токенов.

**Краулер:** только хост введённого URL (и `www.`-вариант), `robots.txt` читается ДО первой
страницы, пауза 1000 мс, 1 поток на сайт, таймаут страницы 15 с, потолок страницы 2 МБ, только
`text/html`; запрет адресов частных сетей (SSRF). PDF: ≤ 10 МБ, ≤ 100 страниц, только с текстовым
слоем.

**Планы (гипотеза цен, A-N6-004):**

| План | Ботов | Страниц на бота | PDF на бота | Ответов в месяц на бота | Ответов в сутки на бота | Бейдж | Цена-гипотеза |
|---|---|---|---|---|---|---|---|
| `free` | 1 | 50 | 3 | 300 | 50 | ОБЯЗАТЕЛЕН | 0 ₽ |
| `nobadge` | 1 | 300 | 10 | 3000 | 300 | нет | 990 ₽/мес |
| `studio` | 10 | 300 | 10 | 3000 | 300 | наш бейдж у клиентских ботов на free-клиентах | 4 900 ₽/мес |

**Потолки (`quota_counter.scope`, ровно 10; сутки — `Europe/Moscow`):**

| scope | Ключ | Предел | Переменная |
|---|---|---|---|
| `visitor_answers` | `visitor_session` | 20 ответов/сутки | `QUOTA_VISITOR_ANSWERS` |
| `ip_answers` | префикс IP /24 (IPv6 /48) | 60 ответов/сутки | `QUOTA_IP_ANSWERS` |
| `bot_day_answers` | `bot_id` | по плану (50 / 300) | `QUOTA_BOT_DAY_FREE`, `QUOTA_BOT_DAY_PAID` |
| `bot_month_answers` | `bot_id` | по плану (300 / 3000) | `QUOTA_BOT_MONTH_FREE`, `QUOTA_BOT_MONTH_PAID` |
| `global_answers` | `all` | 3000 ответов/сутки | `QUOTA_GLOBAL_ANSWERS` |
| `preview_session` | сессия браузера | 1 предпросмотр + 10 ответов/сутки | `QUOTA_PREVIEW_SESSION` |
| `ip_previews` | префикс IP | 3 предпросмотра/сутки | `QUOTA_IP_PREVIEWS` |
| `global_previews` | `all` | 200 предпросмотров, 1000 ответов предпросмотра/сутки | `QUOTA_GLOBAL_PREVIEWS` |
| `account_embed_tokens` | `account_id` | 2 000 000 токенов/сутки | `QUOTA_ACCOUNT_EMBED` |
| `global_embed_tokens` | `all` | 20 000 000 токенов/сутки | `QUOTA_GLOBAL_EMBED` |

Предпросмотр: ≤ 20 страниц, ≤ 40 000 токенов эмбеддингов, живёт 24 ч до сохранения.

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

**Задача индексации:** предельное время 15 мин; таймаут посредника 60 с; не более 2 автоматических
попыток шага; сторож — раз в минуту, `stalled` после 5 мин без обновления.
