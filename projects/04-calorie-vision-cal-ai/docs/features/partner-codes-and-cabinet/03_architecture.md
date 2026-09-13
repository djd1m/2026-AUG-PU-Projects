# Фича `partner-codes-and-cabinet` — архитектура

## Размещение компонентов

Всё — внутри `apps/api` (Fastify). Ни `recognizer`, ни `web` бизнес-логики фичи не содержат;
`web` получает только ответы этих двух маршрутов через существующий формат `{ data, meta }` /
`{ error }`.

```
apps/api/src/partner/
  normalize-code.ts          NormalizeAndFindCode
  apply-partner-code.ts      ApplyPartnerCode (обе блокировки, транзакция, вызывает anti-fraud.ts)
  anti-fraud.ts              AntiFraudOnCode
  manual-unblock.ts          ManualUnblockPartnerCode (админ-операция, без HTTP-маршрута недели)
  activate-attribution.ts    ActivateAttributionOnRecognition (интеграционная точка, см. ниже)
  dashboard-query.ts         PartnerDashboard: SQL-агрегация + разделение i/conv%
apps/api/src/routes/
  codes.ts                   POST /api/v1/codes/apply
  partner.ts                 GET /api/v1/partner/dashboard
packages/shared/src/
  partner-types.ts           ApplyCodeOutcome, DashboardResponse (закрытый набор полей — FR-11/AC-19)
```

Миграций НЕТ: все пять таблиц (`partner`, `partner_code`, `attribution`, `growth_event`,
`device_session`) и оба нужных индекса (`partner_code_code_unique`, `growth_event_partner_idx`)
уже существуют в `packages/db/migrations/001_init.sql` (фича `foundation`). Единственная физическая
проверка, которую стоит сделать при реализации, но которая НЕ требует новой миграции: убедиться, что
`growth_event_partner_idx (partner_code_id, type, created_at)` действительно используется планом
запроса `AntiFraudOnCode` (`EXPLAIN`) — JOIN на `device_session` по первичному ключу не должен
испортить план до полного скана.

## Интеграционная точка: `ActivateAttributionOnRecognition`

Эта фича (`partner-codes-and-cabinet`) идёт СЕДЬМОЙ в роадмапе и зависит от
`share-card-and-growth-events`, которая зависит от `source-and-correct` — то есть путь завершения
распознавания (`UPDATE recognition SET status = 'done'`) к моменту реализации ЭТОЙ фичи уже
существует в кодовой базе. Контракт места вызова, а не конкретный путь файла (файл ещё не написан
на момент планирования):

- Вызов `activateAttributionOnRecognition(deviceSessionId, trx)` вставляется В ТУ ЖЕ транзакцию БД,
  что и оператор, переводящий `recognition.status` в `done` — сразу после него, ДО `COMMIT`.
  Атомарность обязательна: если распознавание зафиксировалось, а активация — нет (или наоборот),
  получится расхождение между дневником пользователя и воронкой партнёра, которое ничем не лечится
  постфактум.
- Функция экспортируется из `apps/api/src/partner/activate-attribution.ts` и принимает уже открытый
  клиент транзакции (`pg` client, не пул) — модуль `source-and-correct` не открывает вторую
  транзакцию ради этого вызова.
- Если к моменту реализации этой фичи путь завершения распознавания ещё не написан (например, из-за
  параллельных worktree), интеграция остаётся именованным TODO с номером `AC-partner-codes-and-cabinet-12`
  в коде и НЕ эмулируется опросом (`SELECT ... WHERE status = 'done' AND processed_at IS NULL`) —
  опрос завёл бы второй, рассинхронизируемый источник истины о том, какие распознавания уже
  обработаны.

## Блокировки: два независимых advisory-лока

`pg_advisory_xact_lock(bigint)` — сессионный (в смысле транзакции БД, не HTTP-сессии) advisory-лок
PostgreSQL: держится до `COMMIT`/`ROLLBACK` текущей транзакции, снимается автоматически, не требует
отдельного `UNLOCK`. Выбран вместо `SELECT ... FOR UPDATE` для случая «строки ещё нет» (при первом
применении кода `attribution` не существует, и `FOR UPDATE` нечего блокировать — классический провал
блокировки на несуществующей строке).

| Лок | Ключ | Что сериализует | Кто берёт |
|---|---|---|---|
| codeLock | `hashtext(partner_code.id::text)` | anti-fraud счётчик и статус-чтение ОДНОГО кода со всех сессий и IP | `ApplyPartnerCode` (шаг 3), `ActivateAttributionOnRecognition` (шаг 3) |
| sessionLock | `hashtext(device_session_id::text)` | три исхода по `source` для ОДНОЙ сессии | `ApplyPartnerCode` (шаг 7) |

Порядок захвата — ВСЕГДА codeLock прежде sessionLock (внутри `ApplyPartnerCode`), и НИКОГДА
наоборот ни в одном алгоритме фичи. Это исключает циклическое ожидание: сценарий deadlock требует,
чтобы транзакция A держала codeLock и ждала sessionLock, пока B держит ИМЕННО ТОТ sessionLock и
ждёт ИМЕННО ТОТ codeLock — при фиксированном одном порядке во всём коде такого ждать не с чего.
`ActivateAttributionOnRecognition` берёт только codeLock (sessionLock ему не нужен: строку
`attribution` он читает `FOR UPDATE` после `WHERE device_session_id`, единственную по построению
`UNIQUE`).

## Зависимости и границы

- **Читает, не пишет:** `device_session.account_id` (пишет `consent-and-telegram-auth`),
  `recognition.status` (пишет `source-and-correct`).
- **Внешних вызовов нет.** Ни модели, ни стороннего API — фича не тратит денег (`model-call-cost.md`
  неприменим).
- **Секреты:** ни один секрет фиче не нужен — только `DATABASE_URL`, уже обязательный у `api`.
- **Ответы на чужой ресурс:** `codes/apply` не адресует чужой ресурс по ID (код применяется к
  СВОЕЙ сессии), поэтому правило «чужое = `404`» не задействовано вовсе; `partner/dashboard` — то
  самое поименованное исключение (`403`, `.claude/rules/security.md`).
- **Rate limit:** `POST /api/v1/codes/apply` — мутирующий маршрут, ограничение частоты ДО разбора
  тела применяется уже существующим middleware `apps/api/src/http/rate-limit.ts`
  (`security-operation-order.md`); фича не создаёт свой ограничитель.

## Ответ маршрутов (закрытая схема — `packages/shared`)

```ts
type ApplyCodeOutcome =
  | { data: { outcome: 'applied' } }
  | { error: { code: 'conflict' } }               // 409
  | { error: { code: 'invalid_code' } }            // 422
  | { error: { code: 'rejected'; reason: 'code_blocked' | 'self_referral' | 'antifraud_ip_burst' } };

type DashboardResponse = {
  data: {
    window: 'day' | 'week' | 'all';
    transitions: number; installs: number; activations: number; shares: number;
    no_data: boolean;
    i: number | { insufficient_data: [n: number, threshold: 30] } | null;
    conv: number | { insufficient_data: [n: number, threshold: 30] } | null;
    updated_at: string;
  };
};
// НЕТ полей: payout, rate, price, earnings, balance, commission — AC-19 проверяет их отсутствие
// как закрытый список запрещённых имён, а не как открытый «не должно быть денег».
```
