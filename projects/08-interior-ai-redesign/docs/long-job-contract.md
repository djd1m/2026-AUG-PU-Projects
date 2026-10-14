# Контракт фоновой задачи N8 — реализованный offline-контракт

**Долгие задачи:** да
**Идентификатор задачи:** id
**Где живёт:** ответ POST /api/projects/:p/jobs → data.id; GET /api/projects/:p/jobs/:j
**Выдаётся:** до начала работы
**Ответ на создание:** идентификатор
**Предельное время задачи:** 120 с
**Таймаут посредника:** 30 с
**Молчание:** неизвестно
**Продолжение при повторе:** идемпотентный-ключ
**Проверка выполнена:** ВЫПОЛНЕНА

## Состояния

| Состояние | Статус | Что видит пользователь | Доказательство |
|---|---|---|---|
| выполняется | ПРОВЕРЕН | durable queued/running, owner GET and same-key replay | tests/design/jobs.test.ts, allocated f.job.id read through jobs.get(f.actor,f.job.id) |
| успех | ПРОВЕРЕН | succeeded, new draft, exact fence and once-only settlement | tests/design/jobs.test.ts, allocated f.job.id read through jobs.get(f.actor,f.job.id) |
| отказ | ПРОВЕРЕН | failed/uncertain, held unknown cost, no blind redispatch | tests/design/jobs.test.ts, allocated f.job.id read through jobs.get(f.actor,f.job.id) |

Уникальный (account_id,idempotency_key) + hash полного payload возвращает один job; изменённый payload даёт409. Claim SKIP LOCKED/fence отделён от внешнего HTTP. Once-only dispatchedAt сохраняется перед сетью. До dispatch истёкшую аренду можно reclaim максимум3; после dispatch только uncertain, никаких automatic paid re-dispatch. Uncertain cost/usage null и holds сохранены. После120с sweeper выводит из running/queued соответственно следам dispatch; реальные последствия reconcile оператором. Эти правила реализованы и независимо проверены в F3 review и narrow closure.

Проверка проведена против реального PostgreSQL с injected offline provider/test clock: admission races, queued→claim→dispatch→success, pre-dispatch expiry/release, post-dispatch uncertain/no redispatch, full-overrun reconciliation. Literal test titles and source hashes: docs/features/design/review.md; whole regression228/228: docs/telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/evidence/final-regression-1.txt. Demo worker exercises real runOneJob without network/spend. Production default manual has no admitted AI jobs; browser reload with live paid inference/provider disruption has NOT been tested. This declaration proves offline lifecycle behavior, not live provider delivery.
