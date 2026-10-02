# Long job contract

**Долгие задачи:** да
**Идентификатор задачи:** job_id
**Где живёт:** ответ POST /api/jobs; чтение GET /api/jobs/{job_id}
**Выдаётся:** до начала работы
**Ответ на создание:** идентификатор
**Предельное время задачи:** 360 с
**Таймаут посредника:** 30 с
**Молчание:** неизвестно
**Продолжение при повторе:** идемпотентный-ключ
**Проверка выполнена:** НЕ ВЫПОЛНЕНА
**Причина:** no-worker

## Состояния

| Состояние | Статус | Что видит пользователь | Доказательство |
|---|---|---|---|
| выполняется | НЕ ПРОВЕРЕН | queued/running по свежему GET, не по молчанию | ожидает реализацию |
| успех | НЕ ПРОВЕРЕН | результат и comparison | ожидает реализацию |
| отказ | НЕ ПРОВЕРЕН | причина, возврат кредита, повтор | ожидает реализацию |

Это проектный контракт, а не фиктивный runtime pass. После кода требуется cut/retry/crash/fence проверка на реальном Postgres.

## Deadline and capacity semantics (validation correction)
The360s bound starts at job admission, including queue time. Unstarted queue expires at60s. Each attempt stops at min(start+180s,admission+360s), even with healthy heartbeats; second attempt may have less than180s remaining. Lease30s and heartbeat10s never extend the hard deadline. Sweeper/API reads make expired states terminal; worker child process is cancelled, late fenced output discarded.

First conservative attempt ticket is admitted atomically with job/credit, so initial capacity exhaustion creates no reservation. A retry or cross-UTC-day start needs a new current-day ticket; failure to obtain it immediately fails/release-once. Old/unused tickets remain counted conservatively. Runtime verification remains NOT performed; these are acceptance rules.
