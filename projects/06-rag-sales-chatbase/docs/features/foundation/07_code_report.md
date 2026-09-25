# foundation — отчёт о коде

**Дата:** 2026-09-25 · **Исполнитель:** Opus 5.5 (агент, автономный режим; модель из метаданных
сессии `claude-opus-5-5[1m]`) · **Ревью другой моделью:** НЕ проводилось в этом прогоне (CLAUDE.md
проекта требует Sonnet 5 как ревьюера — остаётся за координатором) · **Коммита нет** (по постановке).
FR: `FR-AUTH-001`, `FR-LIMIT-004`, `NFR-OPS-001` (часть «ненастроенный потолок валит старт»). ADR:
ADR-001, ADR-012, ADR-014. Переиспользование — [`reuse-map.md`](reuse-map.md).

## Что появилось

| Область | Файлы | Суть |
|---|---|---|
| Монорепо | `package.json`, `package-lock.json` (новый), `tsconfig.base.json`, `vitest.config.ts`, `scripts/{test,lint,test-db}.mjs`, `scripts/test-skip-reporter.ts` | npm workspaces `apps/web`, `apps/worker`, `packages/db`, `packages/rag`; сборка db → rag → worker → web |
| Схема | `packages/db/migrations/001_init.sql`, `packages/db/src/{pool,index,migrate}.ts` | 19 таблиц канона §4; `CREATE EXTENSION vector WITH SCHEMA public`; `chunk.embedding vector(1536)` + HNSW cosine (m=16, ef_construction=64); CHECK всех закрытых перечислений; UNIQUE, несущие атомарность (`index_job (bot_id, idempotency_key)`, `quota_counter (scope, scope_key, period)`, `growth_event (type, dedup_key)`, …); у `quota_counter` нет колонки предела |
| LoadCeilings | `packages/rag/src/{config,enums,constants,index}.ts` | 14 `QUOTA_*` без дефолтов, положительное целое ≤ int4, 8 пар «персональный ≤ общего», таблица по (scope, вид предела); модели из закрытого набора; `N6_PUBLIC_ORIGIN` — origin без слеша, https и не петля вне dev/test |
| Отказ старта | `apps/web/src/preflight.ts` (Dockerfile запускает ДО `next start`), `apps/worker/src/index.ts` | код 1 и сообщение «<ИМЯ> не задана: без неё вызов «…» не ограничен и оплачивается без предела» |
| Вход | `apps/web/src/server/{auth,auth-store,auth-handler,ip,rate-limit,runtime,route,environment}.ts`, `app/api/auth/{register,login,logout}/route.ts` | bcrypt 10 вне транзакции, фиктивный хэш, cookie `__Host-n6_session`, HMAC токена в БД, Origin на мутациях, тело ≤ 4 КБ потоком, лимит Redis 30/120 в минуту |
| Здоровье | `apps/web/src/app/health/route.ts` | `200` только если БД отвечает И расширение `vector` установлено |
| worker-index | `apps/worker/src/{index,environment}.ts` | только проверка конфигурации + отметка жизни `/tmp/n6-worker-heartbeat` (healthcheck compose); **ничего не индексирует** |
| Docker | `Dockerfile` (цели web/worker/migrate/test), `.dockerignore`, `compose.test.yml` (`name: n6-test`) | контекст — корень монорепо, манифесты всех workspace; БД/Redis тестового стека на tmpfs и без портов |
| Стражи | `scripts/check-env-wiring.{sh,mjs}`, `scripts/check-env-complete.sh`, `scripts/test-ceilings-mutations.mjs` | проброс переменных по графу импортов; полнота env-файла; мутации стража старта |
| Тесты | `tests/{config,enums,auth,proxy-rate,health,compose}.test.ts`, `tests/{database,redis}.integration.test.ts`, `tests/fixtures/*` | 260 тестов в 8 файлах |

Решения без владельца — `docs/decisions-autonomous.md` A-N6-021 (XFF одним адресом, IPv6 /48),
A-N6-022 (модели из закрытого набора), A-N6-023 (без `apps/widget`/`packages/queue`, набор статусов
`job_attempt`, пара `ACCOUNT_EMBED ≤ GLOBAL_EMBED`).

## Проверки — команда и итог дословно

| Проверка | Команда | Итог |
|---|---|---|
| установка по lockfile | `npm ci --no-audit --no-fund` | `added 112 packages in 10s` |
| типы | `npm run typecheck` | код 0 (все workspace + `tests/tsconfig.json`) |
| lint | `npm run lint` | `Статические правила: ошибок нет`, код 0 |
| сборка | `npm run build` | код 0; маршруты `ƒ /api/auth/login`, `ƒ /api/auth/logout`, `ƒ /api/auth/register`, `ƒ /health` |
| unit локально (без БД) | `npm test` | `Tests  249 passed \| 11 skipped (260)` + `WARNING: ПРОПУЩЕНО 11 тестов; отсутствуют DATABASE_URL, REDIS_URL. Это НЕ успешная полная проверка.` |
| **полный прогон в образе** на Postgres 16 + pgvector 0.8.6 и Redis 7.4 | `docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test` | `Test Files  8 passed (8)` · `Tests  260 passed (260)`, код 0, пропусков 0 |
| образы стека | `docker compose --env-file /tmp/n6-foundation.env build` | код 0: `n6-sufler-web`, `n6-sufler-worker`, `n6-sufler-migrate`, `caddy:2.8-n6-ratelimit` — `Built`; шаг `RUN caddy list-modules \| grep -q 'http.handlers.rate_limit'` выполнен |
| Caddyfile | `docker run --rm -v …/Caddyfile:… caddy:2.8-n6-ratelimit-foundation caddy validate` | `Valid configuration`, код 0 |
| отказ старта в НАСТОЯЩИХ образах | `docker run --rm --network none --env-file <без QUOTA_GLOBAL_PREVIEW_ANSWERS> n6-sufler-web:foundation` (и `-worker`) | оба — код 1, `… не запущен: QUOTA_GLOBAL_PREVIEW_ANSWERS не задана: …`; с полной конфигурацией worker-index живёт и пишет отметку жизни |
| Правило №0 без `.env` | `node ../../.claude/hooks/check-ports.cjs .` | **2** — `проверка НЕ выполнена: … required variable REDIS_PASSWORD is missing a value` (честный отказ) |
| Правило №0 с временным `.env` (копия env-файла из /tmp, права 600, удалён сразу) | то же | **0** — `из 6 сервисов распознано хранилищ 2, reverse-proxy 1` |
| Правило №0 тестового стека | `node ../../.claude/hooks/check-ports.cjs compose.test.yml` | **0** — `из 3 сервисов распознано хранилищ 2` |
| занятость портов без `.env` | `bash scripts/check-port-conflicts.sh projects/06-rag-sales-chatbase` (из корня) | **1** — конфиг не прочитан, проверки публикации «НЕ выполнены»; `порт 8086 свободен` |
| занятость портов с временным `.env` | то же | **0** — `ни одно хранилище не публикует порт наружу`, `наружу смотрит только reverse-proxy`, `порт 8086 свободен` |
| проброс переменных | `N6_ENV_FILE=/tmp/n6-foundation.env bash scripts/check-env-wiring.sh` | **0** — `Потерь нет. Явные исключения: NEXT_RUNTIME, NEXT_PHASE`; с удалёнными `worker-index.QUOTA_GLOBAL_EMBED` и `web.SESSION_SECRET` — **1** с обоими именами; на пустом compose — **2** |
| полнота env-файла | `sh scripts/check-env-complete.sh /tmp/n6-foundation.env` | `✅ все 21 обязательных переменных объявлены` |

Env-файл `/tmp/n6-foundation.env` (права 600, вне репозитория): пароли БД и Redis —
`openssl rand -hex 24`, `SESSION_SECRET` — `openssl rand -hex 32`, `OPENROUTER_API_KEY` — заглушка
(в этой фиче ни один процесс OpenRouter не вызывает). Тестовый стек остановлен `down -v`;
долгоживущих контейнеров не осталось.

## Что нашла мутация (и что поправлено)

Первый прогон мутаций поймал слабость теста, а не кода: мутация «`0` принимается как предел» дала
только **6** красных из 14 имён. Причина — у общего предела `0` отвергала ПОПАРНАЯ проверка чужой
переменной, и `toThrow(имя)` зеленел по сообщению о паре. Тест ужесточён до точного текста
(`<ИМЯ> непригодна` / `<ИМЯ> пустая строка`); повторный прогон — 14 красных из 14.

Status: completed
