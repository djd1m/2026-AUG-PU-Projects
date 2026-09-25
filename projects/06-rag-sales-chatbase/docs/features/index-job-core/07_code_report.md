# index-job-core — отчёт о коде

**Фича:** 3 `index-job-core` · **Дата:** 2026-09-25 · **Исполнитель:** Opus 5.5 (агент, автономный режим;
фактическая модель — метаданные сессии `claude-opus-5-5[1m]`) · **FR:** `FR-INDEX-003` · **SC:** `SC-US-016-3`
· **ADR:** ADR-009, ADR-012 · Переиспользование — [`reuse-map.md`](reuse-map.md), квитанция —
[`05_completion.md`](05_completion.md). OpenAI/Codex не вызывался.

## carry_over (выполнено первым)

Ревью foundation M1: `JOB_ATTEMPT_STATUS = ['running', 'done', 'failed']` объявлен в
`packages/rag/src/enums.ts` (+ `readJobAttemptStatus` → `failed`, `readFailureReason` → `internal`);
`tests/enums.test.ts` сверяет его с CHECK **тела таблицы** `job_attempt` в `001_init.sql` (не «где-нибудь в
файле»: тот же набор есть у других таблиц). Мутация `attempt-status-out-of-set` → 2 красных.

## Что сделано

| Файл | Что | Алгоритм / требование |
|---|---|---|
| `packages/queue/*` (новый workspace) | очередь `index`, `jobId = index:<id>:<generation>`, `enqueue` без дублей живого задания, числа канона §7, `PREVIEW_JOB_BUDGET` | ADR-009 (BullMQ — транспорт) |
| `packages/db/src/index-jobs.ts` (новый) | `createSourceJobTx`/`createSourceJob` — источник + задача, `ON CONFLICT (bot_id, idempotency_key) DO NOTHING` под `SAVEPOINT` (проигравший откатывает свой источник); `leaseIndexJob` — `FOR UPDATE`, generation = `current_fence`, фенс +1, `job_attempt`, серия, ≤ 2 автоматических попыток; `recordProgressTx`, `completeIndexJob`, `failIndexJob`, `retryAutomatically` — `WHERE id = $1 AND current_fence = $2`, 0 строк → `StaleAttemptError` и откат; `retryIndexJob` — «Повторить»: та же задача, фенс +1, новая серия; `indexJobView`/`readIndexJob` — `running · done · failed · no_response`, чужое = `null` | CreateSource п.4–5, RunIndexJob п.1, 4–6, ReadIndexJob, FR-INDEX-003 |
| `apps/worker/src/watchdog.ts` (новый) | `watchdogTick`: running без пульса 5 мин → `failed(stalled)` + фенс +1; предел 15 мин от начала серии → `failed(stalled)`; `queued` без движения 2 мин → повторная доставка; `draft` старше 24 ч → удалить каскадом; `startWatchdog` раз в минуту | WatchdogTick п.1–3, SC-US-016-3 |
| `apps/worker/src/run-index-job.ts` (новый) | `runIndexJob`: аренда → обработчик → `done`/`failed(reason)`/автоповтор через очередь; устаревшее сообщение — `skipped`, перехваченный фенс — `stale` | RunIndexJob |
| `apps/worker/src/index.ts`, `apps/worker/package.json` | Worker BullMQ (concurrency 1) + сторож; обработчика источников пока нет → `noProcessorYet` закрывает задачу `internal` | ADR-009 |
| `apps/web/src/app/api/index-jobs/[id]/route.ts`, `apps/web/src/server/index-job-handler.ts` (новые) | `GET /api/index-jobs/{id}` → `200 { data: { index_job_id, state, pages_done, pages_total, chunks_done, reason? } }`; без сессии / чужая / несуществующая — один `404`; БД недоступна — `503` | ReadIndexJob, API Contracts |
| `packages/rag/src/enums.ts`, `tests/enums.test.ts` | carry_over | A-N6-023 |
| `package.json`, `package-lock.json`, `Dockerfile`, `vitest.config.ts`, `packages/db/src/index.ts` | сборка `rag → db → queue → worker → web`; `COPY packages/queue/package.json` в стадию deps; алиас `@n6/queue`; `bullmq ^5.81.5` (лок: +bullmq и зависимости, `npm install`) | compose-hygiene п.5 |

Решения без владельца — `docs/decisions-autonomous.md` A-N6-025.

## Проверки (дословно)

| Проверка | Команда | Итог |
|---|---|---|
| typecheck | `npm run typecheck` | 0, ошибок нет |
| lint | `npm run lint` | `Статические правила: ошибок нет` |
| build | `npm run build` | 0; маршрут `ƒ /api/index-jobs/[id]` в сборке Next |
| локально (без БД/Redis) | `npx vitest run` | `Test Files  11 passed | 5 skipped (16)`, `Tests  302 passed | 34 skipped (336)` |
| **прогон в образе** на настоящих Postgres 16 + pgvector 0.8.6 и Redis 7.4 | `docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test` | **`Test Files  16 passed (16)` / `Tests  336 passed (336)`**, код 0, пропусков 0 (`N6_ACCEPTANCE=1`); журнал — `tests/artifacts/index-job-core/compose-test-run.txt` |
| мутации в образе | `… run --rm --build test sh -c 'node scripts/test-db.mjs && node scripts/test-index-job-mutations.mjs'` | код 0, 5/5 пойманы (ниже); журнал — `tests/artifacts/index-job-core/mutations-run.txt` |
| образ воркера | `docker build --target worker` + загрузка модулей + старт без окружения | модули `@n6/queue`, `bullmq`, `watchdog`, `run-index-job` грузятся; старт без `QUOTA_*` → код 1 с именем переменной |
| проброс переменных | `N6_ENV_FILE=/tmp/n6-foundation.env bash scripts/check-env-wiring.sh` | 0 — `Потерь нет. Явные исключения: NEXT_RUNTIME, NEXT_PHASE` (новых переменных фича не вводит) |
| контракт долгой задачи | `node ../../.claude/hooks/check-job-contract.cjs .` | **2** — `проверка НЕ ВЫПОЛНЕНА, причина: not-deployed` (почему это законно — 05_completion) |
| остановка стека | `… down -v` | контейнеры, том и сеть `n6-test` удалены |

## Мутации (guard-must-be-able-to-fail)

| Мутация | Дефект возвращён | Код восстановлен |
|---|---|---|
| `progress-without-fence` — запись прогресса без `WHERE current_fence` | 2 failed \| 47 passed (49), код 1 | 49 passed (49), код 0 |
| `lease-ignores-generation` — аренда не сверяет generation сообщения | 1 failed \| 48 passed (49), код 1 | 49 passed (49), код 0 |
| `attempt-status-out-of-set` — «deferred» в `JOB_ATTEMPT_STATUS` | 2 failed \| 47 passed (49), код 1 | 49 passed (49), код 0 |
| `unknown-status-reads-running` — неизвестный статус задачи → running | 7 failed \| 42 passed (49), код 1 | 49 passed (49), код 0 |
| `silence-reads-running` — молчание > 5 мин читается как «выполняется» | 2 failed \| 47 passed (49), код 1 | 49 passed (49), код 0 |

## Итог

Все проверки постановки выполнены и зелёные; `check-job-contract.cjs` → 2 (not-deployed, законно до стенда — см. 05_completion). Коммита нет (по постановке).

Status: completed
