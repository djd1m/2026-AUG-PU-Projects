# index-job-core — карта переиспользования (источник → назначение → что изменено)

**Дата:** 2026-09-25 · **Донор:** N5 `projects/05-podcast-clips-opus` (ADR-012). Донор только читался.
В каждом новом файле первая строка — комментарий происхождения (`из N5: …` / «написано заново»).

## Ответ по строке `reuse` роадмапа

| # | ADR | Блок | Ответ | Что именно |
|---|---|---|---|---|
| 1 | ADR-012 | очередь и fence (N5 `packages/queue`, `packages/db/src/attempts.ts`) | **адаптировано** | `getRedisConnection` (пароль обязателен, `maxRetriesPerRequest: null` у воркера) и `enqueue` (живое задание той же идентичности не дублируется, терминальное перезапускается) — без изменений по смыслу; `DEFAULT_JOB_OPTIONS { attempts: 1 }` — повторы решает Postgres, не BullMQ — без изменений. Изменено: одна очередь `index` вместо стадий; идентичность `index:<index_job_id>:<generation>` вместо `stage:video_id:fence` (generation — `current_fence` в момент постановки: сообщение с устаревшей generation аренды не получает); фенс живёт в `index_job.current_fence`, попытка — `job_attempt UNIQUE (index_job_id, fence)` (у N5 `UNIQUE (video_id, fence)` и `video.fence`); ≤ 2 автоматических попыток серии — из N5 (`attempt_no >= 2 → null`), но исчерпанная серия закрывается `failed(stalled)`, а не молча возвращает `null`. Числа — канон N6 §7 (stalled 5 мин вместо 30 у N5; предел 15 мин; сторож раз в минуту — как у N5). `DEFER_DELAY_MS` и отложенные попытки N5 не взяты — у N6 нет отложенных стадий |

## Файлы

| Источник | Назначение (N6) | Что изменено |
|---|---|---|
| N5 `packages/queue/package.json`, `src/index.ts` | `packages/queue/package.json`, `src/index.ts` | имя `@n6/queue`, без `@clipmaker/shared` |
| N5 `packages/queue/src/constants.ts` | `packages/queue/src/constants.ts` | числа канона §7; + `JOB_DEADLINE_MS`, `REDELIVER_QUEUED_AFTER_MS`, `DRAFT_TTL_MS`, `PREVIEW_JOB_BUDGET` (20 / 40 000) |
| N5 `packages/queue/src/queues.ts` | `packages/queue/src/queues.ts` | строка 1 таблицы выше |
| N5 `packages/db/src/attempts.ts` | `packages/db/src/index-jobs.ts` (`leaseIndexJob`) | аренда под `FOR UPDATE` строки задачи; generation сообщения обязана совпасть с `current_fence`; `queued` → новая серия, `running` → та же |
| — | `packages/db/src/index-jobs.ts` (`createSourceJobTx`, `recordProgressTx`, `completeIndexJob`, `failIndexJob`, `retryAutomatically`, `retryIndexJob`, `indexJobView`, `readIndexJob`) | **написано заново**: у N5 создание видео без `Idempotency-Key`, состояние читалось через tRPC без «нет ответа», «Повторить» — новая задача, а не новая серия той же |
| N5 `apps/web/src/server/watchdog.ts` | `apps/worker/src/watchdog.ts` | живёт в `worker-index` (канон §6); `FOR UPDATE SKIP LOCKED` пачками, `startWatchdog` — без изменений; шаги — WatchdogTick N6 (stalled, предел 15 мин, повторная доставка `queued`, удаление `draft` старше 24 ч); retention и пересборки N5 не взяты |
| — (форма — обработчики N5 `apps/worker/src/workers/*.ts`) | `apps/worker/src/run-index-job.ts` | **написано заново**: аренда → работа → закрытие по фенсу; `StepFailure(reason, retryable)` |
| N5 `apps/worker/src/index.ts` (подключение Worker) | `apps/worker/src/index.ts` | + Worker BullMQ (concurrency 1), сторож, остановка по SIGTERM |
| — (оформление — N5 `apps/web/src/app/api/auth/*/route.ts`) | `apps/web/src/app/api/index-jobs/[id]/route.ts`, `apps/web/src/server/index-job-handler.ts` | **написано заново**: у N5 нет REST-чтения задачи |
| N6 `scripts/test-quota-mutations.mjs` (он из N5 `test-limits-mutations.mjs`) | `scripts/test-index-job-mutations.mjs` | 5 мутаций задачи индексации; код 2 без `DATABASE_URL` |
| — (форма — N6 `tests/quota.concurrency.test.ts`) | `tests/index-job.fence.test.ts`, `tests/index-job.unit.test.ts`, `tests/index-queue.integration.test.ts` | **написано заново** |
