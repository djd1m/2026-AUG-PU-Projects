# index-job-core — независимое ревью

**Ревьюер:** Sonnet 5 (агент, независимый от автора кода — Opus 5.5; режим «только Anthropic»,
OWN-017) · **Дата:** 2026-09-25 · **Проверено:** незакоммиченные изменения `packages/db/src/index-jobs.ts`,
`packages/queue/*`, `apps/worker/src/{watchdog,run-index-job,index}.ts`,
`apps/web/src/{app/api/index-jobs,server/index-job-handler}.ts`, `packages/rag/src/enums.ts`,
`packages/db/migrations/001_init.sql` (index_job/job_attempt), `tests/index-job.*`,
`tests/index-queue.integration.test.ts`, `scripts/test-index-job-mutations.mjs`.
**Против:** `docs/Pseudocode.md` (CreateSource, RunIndexJob, ReadIndexJob, WatchdogTick, EmbedAndStore
п.4), `docs/long-job-contract.md`, `docs/canon.md` §7, `docs/decisions-autonomous.md` A-N6-025,
корневые `long-running-job.md`, `shared-resource-verification.md`, `security-operation-order.md`,
`guard-must-be-able-to-fail.md`. Код не менялся.

## Вердикт: **APPROVE WITH FIXES**

Реализация фенса, идемпотентности, трёх состояний и сторожа корректна и честно доказана: конкурентные
интеграционные тесты на настоящем Postgres проходят (перепроверено локально: `npm run typecheck` — 0
ошибок; `npx vitest run tests/index-job.unit.test.ts tests/enums.test.ts` — 38/38 зелёных; DB-тесты
локально недоступны без Postgres/Redis, но артефакт `tests/artifacts/index-job-core/compose-test-run.txt`
подтверждает реальный прогон в образе: `Test Files 16 passed (16)` / `Tests 336 passed (336)`, и
`mutations-run.txt` подтверждает 5 отдельных красных/зелёных прогонов с попарно разными числами
red-провалов — мутации различают реализации, не совпадают механически). Один находка требует
исправления перед тем, как код в `closeFailedTx` получит новых вызывающих (сторож уже один из двух);
остальное — замечания низкой серьёзности и уже честно раскрытые в `05_completion.md` пробелы.

## Находки

### [MEDIUM] `closeFailedTx` не защищён собственным условием статуса — доверие только вызывающим
**Файл:** `packages/db/src/index-jobs.ts:107-112`

```ts
export async function closeFailedTx(tx: PoolClient, id: string, reason: IndexJobFailureReason, now: Date): Promise<void> {
  const job = await tx.query(`UPDATE index_job SET status = 'failed', failure_reason = $2,
    current_fence = current_fence + 1, updated_at = $3 WHERE id = $1 RETURNING source_id`, [id, reason, now]);
  ...
}
```

`UPDATE` не несёт `AND status IN ('queued', 'running')` — функция слепо переводит строку ЛЮБОГО
текущего статуса в `failed` и поднимает `current_fence`. Оба сегодняшних вызывающих безопасны, потому
что они САМИ проверяют статус до вызова под тем же локом строки: `leaseIndexJob` (строка 83: `if
(status !== 'queued' && status !== 'running') return null;`, до строки 90) и `watchdog.ts` `closeWhere`
(строки 25-31: `SELECT ... WHERE status = 'running' ... FOR UPDATE SKIP LOCKED`). Но это инвариант,
который держат ВЫЗЫВАЮЩИЕ, а не сама функция — ровно то, от чего предостерегает
`shared-resource-verification.md` (следствие 1: «что удерживается» и кем проверено) и
`guard-must-be-able-to-fail.md` (страж обязан уметь падать сам, не полагаясь на дисциплину снаружи).
Как только у `closeFailedTx` появится третий вызывающий без такой же дисциплины (например, будущая
ручная «Отменить задачу» из кабинета, если её напишут без `FOR UPDATE`), уже `done`-задача будет молча
переведена в `failed` с поднятым фенсом — обратная порча успешного результата, тот же класс дефекта,
что и «запись без `WHERE current_fence`» (мутация `progress-without-fence`, уже пойманная стражом), но
здесь сам страж её не ловит, потому что защита не в этой функции.

**Исправление:** добавить `AND status IN ('queued', 'running')` в `WHERE` и трактовать `rowCount === 0`
как «уже закрыта — ничего не делать» (return, не бросать), симметрично остальным операторам файла
(`recordProgressTx`, `completeIndexJob`, `failIndexJob` все проверяют `rowCount` тем же способом). Тест
на мутацию (снять условие статуса → красный на «done-задача не должна переходить в failed от стороннего
вызова») по образцу уже существующих в `scripts/test-index-job-mutations.mjs` сделает страж
самопроверяемым, а не завязанным на дисциплину вызывающих.

### [LOW] `retryIndexJob` реализован и покрыт тестом, но не привязан ни к одному HTTP-маршруту
**Файл:** `packages/db/src/index-jobs.ts:174-181`; маршруты — `apps/web/src/app/api/index-jobs/[id]/`

`retryIndexJob` (новая серия, поднятый фенс, только владелец и только `failed`-задача — проверено в
`tests/index-job.fence.test.ts` строки 113-125) не вызывается никаким кодом продукта: в
`apps/web/src/app/api/index-jobs/` есть только `GET`, `POST /api/index-jobs/{id}/retry` не создан. Это
не дефект самой функции (она корректна и протестирована), но `05_completion.md` §«Чего фича НЕ
доказывает» называет отсутствующими только маршруты СОЗДАНИЯ (`POST /sources`, `POST /preview`), не
называя отсутствие маршрута «Повторить» — молчание о строке читается как незакрытая строка (конвенция
`CLAUDE.md`: «молчание о строке — незакрытая строка»). Рекомендация: добавить эту строку в квитанцию
следующей фичи, которая создаёт маршрут повтора, либо дополнить текущую квитанцию одним предложением.

### [INFO] `current_fence` (bigint) читается через `Number(...)` без явного парсера типов pg
**Файлы:** `packages/db/src/index-jobs.ts:81,97,180`; `packages/db/src/pool.ts`

`node-postgres` по умолчанию возвращает `int8`/`bigint` (OID 20) СТРОКОЙ, чтобы не терять точность;
`createPool` (`packages/db/src/pool.ts`) не переопределяет парсер типов. Код везде корректно оборачивает
чтение в `Number(row.current_fence)`, что безопасно, пока значение фенса не приближается к
`Number.MAX_SAFE_INTEGER` — реалистично недостижимо (фенс растёт на 1 за попытку/сторожа/«Повторить»).
Не требует исправления; отмечено, чтобы явное решение (bigint-колонка, но фактически используется как
32-битный счётчик) было осознанным, а не случайным.

## Проверено — соответствует постановке (без замечаний)

| # | Что проверялось | Вывод |
|---|---|---|
| 1 | Фенс: запись результата условна по `current_fence`, 0 строк → `StaleAttemptError` и откат; аренда — `FOR UPDATE`, без гонки «прочитать-потом-записать» | `leaseIndexJob` (`index-jobs.ts:75-103`) блокирует строку `index_job` целиком на время решения; `recordProgressTx`/`completeIndexJob`/`failIndexJob`/`retryAutomatically` все несут `WHERE id = $1 AND current_fence = $2` как ПЕРВОЕ условие и бросают `StaleAttemptError` при `rowCount === 0`, что откатывает всю транзакцию через `transaction()`. Подтверждено интеграционным тестом «два воркера на одном фенсе» и мутациями `progress-without-fence` (2 red), `lease-ignores-generation` (1 red) |
| 2 | Идемпотентность создания: `ON CONFLICT … DO NOTHING` под `SAVEPOINT`, второй запрос получает тот же id | `createSourceJobTx` (`index-jobs.ts:37-60`): `SAVEPOINT` → конфликт → `ROLLBACK TO SAVEPOINT` (источник проигравшего не остаётся сиротой) → чтение существующей задачи. Тест «10 одновременных с одним ключом» — 1 задача, 1 источник |
| 3 | Три состояния + `no_response`: молчание ≠ «выполняется»; id выдаётся до работы | `indexJobView` (`index-jobs.ts:192-200`) использует `!(silentFor <= порог)`, что честно трактует `NaN` (нет отметки) как «нет ответа» — fail-closed, не «предположим работает». `INSERT … RETURNING id` в `createSourceJobTx` происходит ДО постановки в очередь (постановка — обязанность вызывающего ПОСЛЕ коммита, зафиксировано комментарием и тестом «id до работы: queued, fence 0») |
| 4 | Сторож: границы 5 мин / 15 мин / 2 мин, не убивает живое, не дублирует постановку | `watchdogTick` (`watchdog.ts`): `stalled` — `updated_at < now-5мин`; `overdue` — `min(started_at)` текущей серии `< now-15мин`; `queued` без движения `> 2мин` — повторная доставка. Все три `SELECT` под `FOR UPDATE [OF j] SKIP LOCKED` — не блокируют и не дублируют работу над строкой, которую в этот момент держит воркер. `enqueue` (`queues.ts:37-47`) не создаёт вторую запись для той же идентичности, пока прежняя жива (`state !== failed/completed → return`) |
| 5 | Изоляция арендатора: чтение — по владельцу, чужая → 404, ключи идемпотентности в рамках `bot_id` | `readIndexJob` (`index-jobs.ts:205-214`): `WHERE ... (b.account_id = $2 OR (b.status='draft' AND b.id=$3))`, несовпадение → `null` → маршрут возвращает 404 неотличимо от несуществующей задачи (проверено тестом «один и тот же ответ 404»). `UNIQUE (bot_id, idempotency_key)` в `001_init.sql:120` — идемпотентность именно в рамках бота, не аккаунта и не глобально |
| 6 | Соединения пула не держатся на время работы | `transaction()` (`quota.ts:8-18`) берёт клиента, `BEGIN`/работа/`COMMIT`, освобождает в `finally` всегда. `runIndexJob` вызывает `deps.process(lease)` (будущий краулер/эмбеддинг) ВНЕ какой-либо открытой транзакции — между `leaseIndexJob` (короткая транзакция) и `completeIndexJob`/`failIndexJob` (тоже короткие) соединение не удерживается |
| 7 | Закрытие «любой задачи как internal» до краулера не оставляет мусор | `noProcessorYet` бросает `StepFailure('internal', retryable по умолчанию false)`; `runIndexJob` закрывает `failIndexJob` немедленно, без автоповтора; функция ВСЕГДА резолвится (не бросает наружу), поэтому BullMQ отмечает задание `completed` штатно — новых заданий не плодится. Файлов на диске эта фича не создаёт (маршрут приёма PDF не реализован), поэтому мусора в томе `uploads` тоже нет |
| 8 | Мутации действительно различают реализации | `scripts/test-index-job-mutations.mjs` — не имитация: копирует дерево во временный каталог, применяет строковый патч К РЕАЛЬНОМУ исходнику по уникальным якорям (бросает, если якорь не найден или не уникален), гоняет реальный vitest, требует `red.code===1 && green.code===0 && !skipped` для каждой из 5 мутаций. Числа red различны (2, 1, 2, 7, 2) — не механическое совпадение |

## Дополнительно — не находка, а согласие с честным раскрытием

`05_completion.md` п.6 «Разделяемый ресурс под нагрузкой не измерялся» (пачки до 500 строк под
`FOR UPDATE SKIP LOCKED` в одной транзакции сторожа) — согласен, это реальный открытый вопрос
`shared-resource-verification.md` (вопрос 2: «сколько единиц ресурса всего»), количественно не измерен
и честно назван таковым, а не выдан за проверенный. Не блокирует ревью этой фичи.

## Заключение

Ключевой инвариант фичи — «один результат, второй stale» под конкурентной гонкой — доказан на
настоящем Postgres, а не только рассуждением, и стражи умеют падать (мутации). Единственное
исправление, нужное перед тем как код продолжит расти (маршруты создания, краулер): закрыть
`closeFailedTx` собственным условием статуса, чтобы функция была безопасной сама по себе, а не только
в руках сегодняшних двух вызывающих.

Status: completed
