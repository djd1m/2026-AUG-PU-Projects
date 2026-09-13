# Фича `partner-codes-and-cabinet` — псевдокод

Источник данных: `docs/canon.md` §4, схема `packages/db/migrations/001_init.sql` (таблицы `partner`,
`partner_code`, `attribution`, `growth_event`, `device_session` — уже существуют, эта фича НЕ
добавляет миграций). Корневые алгоритмы: `docs/Pseudocode.md` `ApplyPartnerCode`, `AntiFraudOnCode`,
`PartnerDashboard` — ниже их реализационная развёртка с явными шагами блокировки, которых корневой
документ (по своей роли — логика, не физика конкурентности) не обязан содержать.

## Data Structures (без изменений схемы)

Использует напрямую: `partner(id, account_id, status)`, `partner_code(id, partner_id, code, status,
blocked_reason, blocked_at)`, `attribution(id, device_session_id, partner_code_id, status,
reject_reason, source, replaced_source, activated_at)`, `growth_event(id, type, device_session_id,
partner_code_id, created_at)`, `device_session(id, account_id, ip_prefix)`.

Блокировочные ключи (не колонки, вычисляются на лету): `codeLockKey = hashtext(partner_code.id::text)`,
`sessionLockKey = hashtext(device_session_id::text)` — оба передаются в
`pg_advisory_xact_lock(bigint)`, снимаются автоматически на `COMMIT`/`ROLLBACK` транзакции.

### Algorithm: NormalizeAndFindCode

REQUIREMENT: `FR-partner-codes-and-cabinet-1`
REQUIREMENT: `AC-partner-codes-and-cabinet-1`
REALISES: SC-US-010-2, AC-partner-codes-and-cabinet-1

INPUT: сырая строка кода от клиента.
OUTPUT: `found(partner_code)` либо `invalid`.
STEPS:
1. Обрезать пробелы по краям, привести к верхнему регистру.
2. Проверить форму `^[A-Z0-9]{4,12}$`. Не проходит → RETURN `invalid`.
3. `SELECT * FROM partner_code WHERE code = :normalized`. Не найден → RETURN `invalid`.
4. RETURN `found(partner_code)`.
COMPLEXITY: O(1), индекс `partner_code_code_unique`.

### Algorithm: ApplyPartnerCode (реализационная развёртка корневого алгоритма)

REQUIREMENT: `FR-partner-codes-and-cabinet-2`
REQUIREMENT: `FR-partner-codes-and-cabinet-4`
REQUIREMENT: `FR-partner-codes-and-cabinet-5`
REQUIREMENT: `FR-partner-codes-and-cabinet-6`
REQUIREMENT: `AC-partner-codes-and-cabinet-2`
REQUIREMENT: `AC-partner-codes-and-cabinet-3`
REQUIREMENT: `AC-partner-codes-and-cabinet-4`
REQUIREMENT: `AC-partner-codes-and-cabinet-5`
REQUIREMENT: `AC-partner-codes-and-cabinet-6`
REQUIREMENT: `AC-partner-codes-and-cabinet-7`
REQUIREMENT: `AC-partner-codes-and-cabinet-8`
REQUIREMENT: `NFR-partner-codes-and-cabinet-1`
REALISES: SC-US-010-1, SC-US-010-2, AC-partner-codes-and-cabinet-2, AC-partner-codes-and-cabinet-3,
AC-partner-codes-and-cabinet-4, AC-partner-codes-and-cabinet-5, AC-partner-codes-and-cabinet-6,
AC-partner-codes-and-cabinet-7, AC-partner-codes-and-cabinet-8

INPUT: `device_session_id`, `ip_prefix` вызывающего, источник вызова (`explicit` — маршрут
`codes/apply`; `deeplink`/`cookie` — внутренний вызов из `scan-pipeline`/веб-клиента), сырая строка
кода.
OUTPUT: `applied` | `conflict` | `invalid` | `rejected(reason)`.
STEPS:
1. `NormalizeAndFindCode(строка)`. `invalid` → RETURN `invalid`, транзакция не открывается (нечего
   откатывать — ни одной строки ещё не тронуто).
2. BEGIN.
3. `SELECT pg_advisory_xact_lock(hashtext(partner_code.id::text))` — codeLock. Дальше в этой
   транзакции никто, кроме нас, не решает судьбу ЭТОГО кода.
4. Перечитать `partner_code.status` (свежее значение — не то, что было в шаге 1, которое могло
   устареть, пока лок ждал своей очереди). `= blocked` → журнал `code_blocked`, ROLLBACK, RETURN
   `rejected(code_blocked)`.
5. Если `device_session.account_id IS NOT NULL AND device_session.account_id =
   partner_code.partner.account_id` → журнал `self_referral`, ROLLBACK, RETURN
   `rejected(self_referral)`.
6. `AntiFraudOnCode(partner_code, ip_prefix, NOW())` — выполняется ВНУТРИ этой же транзакции, под
   тем же codeLock (см. алгоритм ниже). Возвращает `block` → ROLLBACK, RETURN
   `rejected(antifraud_ip_burst)` (COMMIT для блокировки кода делает сам `AntiFraudOnCode` до
   возврата `block` — см. его шаг 3).
7. `SELECT pg_advisory_xact_lock(hashtext(device_session_id::text))` — sessionLock. Порядок
   ВСЕГДА codeLock → sessionLock: два кода одной сессии берут этот лок в этом же порядке (очередь
   на sessionLock), код от двух сессий — очередь на codeLock; обратной комбинации нет, взаимной
   блокировки быть не может.
8. `SELECT * FROM attribution WHERE device_session_id = :id FOR UPDATE` (лок сессии уже держит
   очередь, `FOR UPDATE` дополнительно защищает от иных путей записи в эту же строку, например от
   `ActivateAttributionOnRecognition`, работающего под ДРУГИМ, но тем же sessionLock-ключом).
9. IF строки НЕТ THEN `INSERT attribution (device_session_id, partner_code_id, source,
   replaced_source, status) VALUES (:id, :code_id, :source_вызова, NULL, 'pending')`.
   GOTO шаг 12 (`applied`).
10. IF `existing.source ∈ {cookie, deeplink}` AND `источник_вызова = explicit` THEN
    `UPDATE attribution SET partner_code_id = :code_id, replaced_source = existing.source,
    source = 'explicit' WHERE id = existing.id`; журнал `replaced_weaker_source` (оба кода).
    GOTO шаг 12 (`applied`).
11. Иначе (explicit+любой, включая тот же код; ИЛИ слабый+слабый) → COMMIT (ничего не менялось),
    RETURN `conflict`.
12. `INSERT growth_event (type, device_session_id, partner_code_id) VALUES ('code_applied', :id,
    :code_id)`. COMMIT. RETURN `applied`.
COMPLEXITY: O(1) при индексах `partner_code_code_unique`, `attribution_device_session_unique`.

### Algorithm: AntiFraudOnCode (реализационная развёртка)

REQUIREMENT: `FR-partner-codes-and-cabinet-3`
REQUIREMENT: `AC-partner-codes-and-cabinet-9`
REQUIREMENT: `AC-partner-codes-and-cabinet-10`
REQUIREMENT: `NFR-partner-codes-and-cabinet-2`
REALISES: AC-partner-codes-and-cabinet-9, AC-partner-codes-and-cabinet-10

INPUT: `partner_code` (уже codeLock-нута вызывающим), `ip_prefix`, текущее время.
OUTPUT: `allow` | `block`.
STEPS:
1. Выполняется ТОЛЬКО если `ApplyPartnerCode` дошёл до этого шага — то есть код уже НЕ `blocked`
   (проверено шагом 4 вызывающего ПОСЛЕ захвата codeLock). Это и есть AC-10: заблокированный код
   короткует на предыдущем шаге и до подсчёта не доходит вовсе — окно НЕ пересчитывается повторно.
2. `SELECT count(*) FROM growth_event ge JOIN device_session ds ON ds.id = ge.device_session_id
   WHERE ge.type = 'code_applied' AND ge.partner_code_id = :code_id AND ds.ip_prefix = :ip_prefix
   AND ge.created_at > now() - interval '10 minutes'`.
3. IF count > 50 THEN `UPDATE partner_code SET status = 'blocked', blocked_reason =
   'antifraud_ip_burst', blocked_at = now() WHERE id = :code_id`; журнал `antifraud_ip_burst` (код,
   `ip_prefix`, время — БЕЗ полного адреса). RETURN `block`.
4. RETURN `allow`.
COMPLEXITY: O(k) по индексу `growth_event_partner_idx (partner_code_id, type, created_at)`, где k —
число применений в окне (≤ 50 на успешный путь).

Под codeLock шаг 2–3 выполняется СЕРИАЛИЗОВАННО для одного кода: при 20 одновременных применениях
одного кода каждый вызов ждёт своей очереди на codeLock, поэтому `count` каждого следующего вызова
УЖЕ учитывает применения предыдущих в очереди — блокировка срабатывает РОВНО один раз, на первом
вызове, чей `count` превысил 50, а не параллельно у всех 20 (AC-9).

### Algorithm: ManualUnblockPartnerCode

REQUIREMENT: `FR-partner-codes-and-cabinet-7`
REQUIREMENT: `AC-partner-codes-and-cabinet-11`
REALISES: AC-partner-codes-and-cabinet-11

INPUT: `partner_code_id`, оператор (административная операция, вне продуктового API недели).
OUTPUT: `unblocked` | `not_blocked`.
STEPS:
1. `SELECT status FROM partner_code WHERE id = :id`. `≠ blocked` → RETURN `not_blocked` (нечего
   снимать).
2. `UPDATE partner_code SET status = 'active', blocked_reason = NULL, blocked_at = NULL WHERE id =
   :id`.
3. Журнал `manual_unblock` (код, время, идентификатор оператора).
4. RETURN `unblocked`.
COMPLEXITY: O(1). Единственный путь, меняющий `blocked → active` во всём коде фичи — страж по
исходнику (AC-11) проверяет, что других таких путей НЕТ (ни фоновой задачи, ни условия на
`blocked_at` в SQL, ни TTL).

### Algorithm: ActivateAttributionOnRecognition

REQUIREMENT: `FR-partner-codes-and-cabinet-8`
REQUIREMENT: `AC-partner-codes-and-cabinet-12`
REQUIREMENT: `AC-partner-codes-and-cabinet-13`
REQUIREMENT: `AC-partner-codes-and-cabinet-14`
REALISES: SC-US-010-1, AC-partner-codes-and-cabinet-12, AC-partner-codes-and-cabinet-13,
AC-partner-codes-and-cabinet-14

INPUT: `device_session_id` сессии, чьё распознавание только что получило `recognition.status =
done`. Вызывается интеграционной точкой `source-and-correct` В ТОЙ ЖЕ транзакции, что и сам `UPDATE
recognition SET status = 'done'` (контракт места вызова — `03_architecture.md`).
OUTPUT: `activated` | `rejected(reason)` | `no_attribution` | `already_settled` (идемпотентность).
STEPS:
1. `SELECT * FROM attribution WHERE device_session_id = :id FOR UPDATE`. Строки нет → RETURN
   `no_attribution` (сессия пришла без кода — законный и самый частый случай).
2. `status ≠ pending` (уже `activated` или `rejected` прошлым вызовом) → RETURN `already_settled`,
   НИЧЕГО не менять (идемпотентность второго и последующих успешных распознаваний, AC-12).
3. `pg_advisory_xact_lock(hashtext(partner_code_id::text))` — codeLock того же ключа, что в
   `ApplyPartnerCode`: активация не должна разминуться с конкурентной блокировкой этого же кода.
4. Перечитать `partner_code.status`. `= blocked` → `UPDATE attribution SET status = 'rejected',
   reject_reason = 'code_blocked' WHERE id = :attribution.id`. RETURN `rejected(code_blocked)`
   (AC-13). `growth_event(activation)` НЕ пишется.
5. Перечитать `device_session.account_id`. Равен `partner.account_id` владельца кода → `UPDATE
   attribution SET status = 'rejected', reject_reason = 'self_referral' WHERE id =
   :attribution.id`. RETURN `rejected(self_referral)` (AC-14). `growth_event(activation)` НЕ
   пишется.
6. Иначе → `UPDATE attribution SET status = 'activated', activated_at = now() WHERE id =
   :attribution.id`; `INSERT growth_event (type, device_session_id, partner_code_id) VALUES
   ('activation', :id, :partner_code_id)`. RETURN `activated`.
COMPLEXITY: O(1). `reject_reason = antifraud_ip_burst` этим алгоритмом НИКОГДА не записывается —
названный, честно непокрытый пробел (см. `01_specification.md`, «Решение…», и follow-up в
`05_completion.md`): различить задним числом, какая ИЗ ДВУХ причин блокировки относилась к ЭТОЙ
конкретно `pending`-строке в момент, когда код заблокировали, без хранения снимка на момент
блокировки, нечестно.

### Algorithm: PartnerDashboard (реализационная развёртка)

REQUIREMENT: `FR-partner-codes-and-cabinet-9`
REQUIREMENT: `FR-partner-codes-and-cabinet-10`
REQUIREMENT: `FR-partner-codes-and-cabinet-11`
REQUIREMENT: `AC-partner-codes-and-cabinet-15`
REQUIREMENT: `AC-partner-codes-and-cabinet-16`
REQUIREMENT: `AC-partner-codes-and-cabinet-17`
REQUIREMENT: `AC-partner-codes-and-cabinet-18`
REQUIREMENT: `AC-partner-codes-and-cabinet-19`
REALISES: SC-US-011-1, SC-US-011-2, AC-partner-codes-and-cabinet-15, AC-partner-codes-and-cabinet-16,
AC-partner-codes-and-cabinet-17, AC-partner-codes-and-cabinet-18, AC-partner-codes-and-cabinet-19

INPUT: аутентифицированный вызывающий (`account_id` из сессии), окно `day|week|all` из query.
Значение кода в ЛЮБОМ поле запроса — ИГНОРИРУЕТСЯ (не читается ни в одной строке этого алгоритма;
страж AC-17 проверяет отсутствие такого чтения по исходнику).
OUTPUT: `{ transitions, installs, activations, shares, updated_at }` либо `403`.
STEPS:
1. `SELECT id FROM partner WHERE account_id = :caller.account_id`. Нет строки → RETURN `403`
   («вы не партнёр», не «код не найден» — тело ответа не содержит ни кода, ни причины отказа,
   способной раскрыть чужие данные).
2. `SELECT id FROM partner_code WHERE partner_id = :partner.id` — код разрешён ИСКЛЮЧИТЕЛЬНО отсюда.
3. Границы окна: `day` = текущие сутки `Europe/Moscow` (согласованно с каноном §7, хотя окно
   счётчика само по себе — не сутки-специфичный ресурс, а витрина), `week` = 7 суток, `all` = без
   нижней границы.
4. Четыре `SELECT count(*) FROM growth_event WHERE partner_code_id = :code_id AND type = :T AND
   created_at >= :window_start`, `T ∈ {card_view, install, activation, share_click}`. Ноль строк по
   ВСЕМ четырём → пометка `no_data = true` на ответе, значения — явные `0` (AC-18).
5. `i = activations > 0 ? shares / activations : null`; `conv = installs > 0 ? installs /
   transitions : null` — ДВА раздельных поля, произведение НЕ вычисляется никогда.
6. Число наблюдений для доли — `activations` (для `i`) и `transitions` (для `conv`). Каждое < 30 →
   вместо числового значения поле-строка `insufficient_data(n, 30)` вместо доли (AC-18).
7. Денежных полей (`payout`, `rate`, `price`, `earnings`, `balance`, `commission`) в схеме ответа
   НЕТ ни одного (AC-19, `packages/shared` объявляет тип ответа явно закрытым набором полей).
8. RETURN `{ transitions, installs, activations, shares, i, conv, no_data, updated_at: now() }`.
COMPLEXITY: O(log n) по индексу `growth_event_partner_idx`.
