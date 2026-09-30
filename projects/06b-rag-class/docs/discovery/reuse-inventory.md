# Инвентарь переиспользования N1–N5 для N6b (PD-REUSE-001)

**Дата:** 2026-09-30 · **Ревизия репозитория:** `e8f9dd76` · **Кто:** read-only аудит (Explore-агент, Claude), свод — исполнитель Фазы 0.
**Правило владельца №4:** модули N1–N5 переиспользуются; код N6 (`projects/06-rag-sales-chatbase`) НЕ используется.

**Честность происхождения.**
- Аудитор работал только на чтение и не смог записать файловую квитанцию (`n6b-p0-reuse-audit`): отчёт пришёл текстом и
  сохранён сюда исполнителем. По `swarm-file-evidence.md` это отклонение, названное явно.
- Раскрытое нарушение границы: один glob `ls projects/*/scripts` вывел ИМЕНА файлов одного каталога без заголовка — почти
  наверняка `projects/06-rag-sales-chatbase/scripts`. Файлы не открывались и в инвентарь не вошли.
- **Исключено сознательно:** записи корневого `.claude/insights/index.md`, чья ссылка ведёт в `projects/06-rag-sales-chatbase`
  (уроки о бюджете эмбеддингов и склейке текста при извлечении HTML). Это решения N6; их перенос сделал бы повтор
  нечестным. Пайплайн обязан дойти до них сам (или не дойти — это тоже результат занятия).

## Чего нет ни в одном из N1–N5 (писать с нуля)
Краулер сайта и работа с sitemap/robots.txt · извлечение текста из PDF · pgvector/эмбеддинги/векторный поиск (есть только
`pg_trgm` в N4) · RAG-ответ со ссылкой на источник и «не знаю + контакт». `05a-podcast-clips-opus` — только документы.

## Инвентарь

| # | Возможность | Путь | Тесты | Потребность MVP | Адаптация | Оговорки | Коммит |
|---|---|---|---|---|---|---|---|
| 1 | Виджет одним `<script data-slug async>`: `currentScript`, Shadow DOM, esbuild-бандл с хэшем, бюджет ≤30 KB gzip | `projects/01-testimonials-senja/apps/widget/` | `apps/widget/tests/{isolation,xss,photo,badge-link,badge-integrity}.test.ts` | виджет | рендер отзывов → чат-пузырь (ввод, ответ, ссылка на источник), POST вопросов, CORS для чужих origin | нет защиты от двойного тега (GAP в Refinement §2) | `6a990fa7` |
| 2 | Бейдж на клиенте: показ только при `badge_required:true` с сервера, самовосстановление (MutationObserver + 2 с), клики через `sendBeacon` | `.../01-testimonials-senja/apps/widget/src/badge.ts` | `badge-integrity`, `badge-link` | бейдж на Free | ребрендинг | скрытие родителя вне shadow root только логируется; реальное скрытие ловит лишь браузерный E2E | `6a990fa7` |
| 3 | Бейдж на сервере: `buildBadgeUrl` с UTM, тариф решает `badge_required`, ручки config и badge-click | `.../01-testimonials-senja/apps/web/src/lib/{badge,widget-config,tariff}.ts`, `app/api/widget/{config,badge-click}/route.ts` | `apps/web/tests/{badge,widget-config,tariff}.test.ts` | снятие бейджа — платно | тариф бота; контракт «решает сервер» (ADR-002 N1) | в N1 противоречие цены тарифа между документами | `5b75587d`, `c1166fb9` |
| 4 | Учёт установок по (проект, домен): `normalizeDomain` (Origin/Referer, `"null"`, порты), `ON CONFLICT DO NOTHING RETURNING`, свой домен исключён | `.../01-testimonials-senja/apps/web/src/lib/widget-install.ts`, `packages/db/migrations/004_growth.sql` | `apps/web/tests/widget-install.test.ts`, `packages/db/tests/widget-installs.test.ts` | метрика недели | триггер «отрисован» → «≥1 вопрос» | превью-домены (`*.vercel.app`) считаются установками — открытый вопрос | `31163db3` |
| 5 | Лимитер на Postgres (скользящее окно), очистка воркером | `.../01-testimonials-senja/packages/db/migrations/006_rate_limit.sql`, `services/worker/src/cleanup-job.ts` | `packages/db/tests/rate-limit.test.ts` | лимиты публичных ручек | новые scope | грубый счётчик по IP | `0cc4fea4` |
| 6 | Аутентификация владельца (HMAC-хэш сессии, httpOnly, fail-closed по `SESSION_SECRET`), регистрация, сброс пароля, Яндекс ID | `.../01-testimonials-senja/apps/web/src/lib/{session,login,register,password*,sso*}.ts` | `apps/web/tests/{auth-primitives,login*,register,password-*,sso*}.test.ts` | вход | как есть или #24/#28 | `409` раскрывает существование e-mail; гонки в `forgot` | `1da81ea5` |
| 7 | Воркер на Postgres `FOR UPDATE SKIP LOCKED`, без Redis | `.../01-testimonials-senja/services/worker/` | `services/worker/tests/{skip-locked,...}.test.ts` | фоновые задачи | задача транскрипции → обход/индексация | блокировка строки держится весь внешний вызов — для минутных задач лучше #13 | `ed3849b3` |
| 8 | Партнёрские коды, атрибуция (промокод > cookie), запрет self-referral, кабинет по токену | `.../01-testimonials-senja/apps/web/src/lib/{partner,partner-auth,referral}.ts` | `apps/web/tests/{partner,partner-dashboard,referral}.test.ts` | студии (реферальная часть) | — | нет sub-аккаунтов | `a63a54b6` |
| 9 | RLS-изоляция арендатора: роль + `SET LOCAL` в транзакции | `.../01-testimonials-senja/packages/db/migrations/{002_roles,007_rls}.sql`, `.claude/patterns/rls-tenant-transaction.md` | `packages/db/tests/rls.test.ts` | боты/источники/фрагменты по аккаунтам | — | ломается с пулом, выдающим соединение на запрос | `0cc4fea4` |
| 10 | Скрипты стыков: CJM на стенде, проброс env, порты, собираемость compose | `.../01-testimonials-senja/scripts/{check-cjm,check-env-wiring,check-port-conflicts,check-compose-buildable}.sh`; корень `scripts/check-port-conflicts.sh`; N5 `scripts/check-env-wiring.{sh,mjs}` | N4 `tests/integration/check-env-wiring.test.ts` | деплой на VPS | `check-cjm.sh` привязан к ручкам N1 | метки «ЗАМЕЩЕНИЕ» | `ed3849b3`, `d3f096ea` |
| 11 | Агентство → клиентские sub-аккаунты: `accounts.parent_account_id`, триггер «один уровень», RLS; план передачи аккаунта клиенту | `projects/02-review-qr-reputation/packages/db/migrations/{002_core,007_rls_owner}.sql`; план `projects/02-review-qr-reputation/docs/features/client-account-handover/` | `apps/web/tests/owner.test.ts` (смежно) | **FR-GROWTH-004** | перенести модель на ботов; передачу — по плану | план тира XL, кода нет; перенос строки через границу арендатора ломает 11 RLS-политик | `27ee2e6b`, `0237d7e3` |
| 12 | Ступенчатый лимитер: грубый барьер в памяти + окно в БД с try-advisory-lock | `projects/02-review-qr-reputation/services/intake/src/{limit,barrier}.ts` | `services/intake/tests/intake.test.ts` (конкурентный) | лимит вопросов виджета | scope (IP, бот), (бот) | занятый ключ — сразу отказ | `14791838` |
| 13 | Аренда задачи + fence (`leased_until`, `lease_fence`, ≤3 захвата) + уборщик зависших | `projects/04-calorie-vision-cal-ai/apps/recognizer/src/{lease.ts,recognize/sweep-stuck-scans.ts}` | `tests/concurrency/{lease,renewal-lease}.test.ts` | минутные задачи обхода/индексации | обобщить до `index_job`; бюджет минут, не 30 с | без уборщика исчерпанная задача вечно `queued` | `70bfe4e3`, `1083a89c` |
| 14 | Атомарные квоты: одна инструкция на ключ, все ключи попытки в одной транзакции, сутки по Москве | `projects/04-calorie-vision-cal-ai/apps/api/src/quota/*`, `packages/db/src/quota.ts` | `tests/concurrency/quota-parallel.test.ts` | потолки расходов | новые scope | расхождение лимита стенда и OWN-008 | `3d9c8356` |
| 15 | Журнал вызовов модели, переживающий падение (START до вызова, ровно один OUTCOME) | `projects/04-calorie-vision-cal-ai/apps/recognizer/src/observability/model-call-log.ts` | `tests/integration/observability/` | видимость расхода | чат + эмбеддинги | — | `fc859978` |
| 16 | Порт провайдера модели: дедлайн, проверка схемы, без скрытых повторов; адаптеры fake/live/OpenRouter | `projects/04-calorie-vision-cal-ai/apps/recognizer/src/provider/*` | `tests/unit/provider-openrouter.test.ts` | RAG-ответ | схема vision → текст с цитатами; эмбеддингам нужен новый порт | передача данных сторонним процессорам → согласие | `a8dce689` |
| 17 | Партнёрка N4: коды, антифрод, начисление комиссии | `projects/04-calorie-vision-cal-ai/apps/api/src/{partner,commission}/*` | `tests/{unit,concurrency,integration}/partner/` | студии (деньги — вне сборки) | — | — | `a6450211` |
| 18 | Очереди BullMQ на Redis, `stage:id:fence`, попытки с fence в БД | `projects/05-podcast-clips-opus/packages/queue/src/*`, `apps/worker/src/*` | `tests/queue-*.test.ts` | стадии crawl→chunk→embed | переименовать стадии; добавляет Redis | ревью `docs/reviews/02_*`, `05_*` | `d45af302` |
| 19 | Потолки расходов по контракту: ненастроенный предел валит старт, квоты на пользователя и сутки, журнал трат до вызова | `projects/05-podcast-clips-opus/packages/db/src/{quota,plan}.ts`, `apps/web/src/server/limits.ts`, `apps/worker/src/llm/spend.ts`, `docs/model-cost-contract.md` | `tests/{limits*,model-spend,...}.test.ts` | потолки платных вызовов | единицы: токены/ответы на бота, страницы индексации | журнал не покрыт на сетевых ФС | `81916d0a`, `2a6a55d5` |
| 20 | Redis-лимит (Lua INCR+PEXPIRE), ключ — HMAC префикса IP /24 · /64 | `projects/05-podcast-clips-opus/apps/web/src/server/{rate-limit,ip}.ts` | `tests/ip-prefix.test.ts` и др. | лимиты API виджета | новый вид «вопрос» | — | `2d5abc77` |
| 21 | Caddy: HSTS, `trusted_proxies`, `no-store` на публичных страницах | `projects/05-podcast-clips-opus/proxy/Caddyfile` (+ N1, N4) | `tests/proxy-rate.test.ts` | Caddy на VPS | CORS и кэш для бандла виджета | лимит Caddy на адрес считал статику и бандл виджета → 429 у офисов за NAT (insights 2026-09-27) | `f5b1a198` |
| 22 | Compose: web + воркеры, `postgres:16.4-alpine`, `redis:7.4-alpine`, `caddy:2.8-alpine` | `projects/05-podcast-clips-opus/docker-compose.yml` | `tests/wiring.test.ts` | compose на VPS | образ БД с pgvector (например `pgvector/pgvector:pg16`) | — | — |
| 23 | S3 multipart presigned-загрузка | `projects/05-podcast-clips-opus/packages/s3/src/*`, `apps/web/src/server/upload-*.ts` | `tests/{s3*,upload*}.test.ts` | загрузка PDF (без извлечения текста) | тип/размер PDF, проверка magic bytes | — | `388742a0` |
| 24 | Auth N5: bcrypt, фиктивный хэш против тайминга, сессия 7 дней | `projects/05-podcast-clips-opus/apps/web/src/server/auth*.ts` | `tests/{auth,bcrypt-load}.test.ts` | вход (альтернатива #6) | — | — | `8da56bf1` |
| 25 | Атрибуция партнёра N5 (явная, гостевая ссылка, cookie; ADR-007) | `projects/05-podcast-clips-opus/apps/web/src/server/{partner,partner-code}.ts` | `tests/partner*.test.ts` | студии (реферальная часть) | — | — | `a4167186` |
| 26 | Публичные страницы без входа на своём origin (`/c/{code}`, `/g/{guest_code}`; N2 guest) | `projects/05-podcast-clips-opus/apps/web/src/app/{c/[code],g/[guest_code]}/route.ts`; `projects/02-review-qr-reputation/apps/guest/src/*` | `tests/short-link*.test.ts`, N2 `apps/guest/tests/purity.test.ts` | **публичная демо-страница бота** | новый тип `/b/{bot}` со встроенным чатом | — | `c8cb701b` |
| 27 | iframe-встраивание через postMessage с allowlist origin | `projects/03-affiliate-rewardful/variants/b-customer/app/embed.mjs` | `tests/b-ui-boundary.test.mjs` | iframe-вариант виджета (опц.) | allowlist на бота | стенд N3 не пересобирать с HEAD | `57d5bfe9` |
| 28 | Argon2id + внутренние сессии (N3a, пауза) | `projects/03a-affiliate-rewardful/apps/web/src/lib/` | `apps/web/tests/{password,session,...}.test.ts` | вход (альтернатива) | — | проект на паузе | `5102d8e0` |

## Правила и стражи корня, прямо применимые
`embeddable-widget.md` + `check-embed-contract.cjs` · `long-running-job.md` + `check-job-contract.cjs` · `model-call-cost.md` +
`check-model-cost.cjs` · `compose-hygiene`, `docker-ports`, `deployment-seams`, `fail-closed-defaults`, `shared-resource-verification`,
`silent-fallbacks`. Заполненные образцы контрактов: `projects/05-podcast-clips-opus/docs/{embed,long-job,model-cost,webhook}-contract.md`.
Проверка виджета на враждебной странице: `projects/01-testimonials-senja/docs/Refinement.md` §1.1, неснимаемость бейджа — §3.1.

## Уроки корневого insights, допустимые для повтора (без ссылок на N6)
- 2026-09-27: лимит Caddy на адрес задел статику и бандл виджета → 429 у офисов за NAT; исключать `/_next/static/*` и бандл.
- 2026-09-26: браузер не шлёт `Origin` на same-origin GET — важно для CORS и атрибуции домена.
- 2026-09-27: скриншот Playwright сам нарушает CSP страницы (ложное срабатывание в проверке под CSP).
- 2026-09-26: `FOR UPDATE` на строке аккаунта клинит с внешним ключом — `FOR NO KEY UPDATE`.

Прочие записи индекса, ведущие в `projects/06-rag-sales-chatbase`, исключены (см. шапку).
