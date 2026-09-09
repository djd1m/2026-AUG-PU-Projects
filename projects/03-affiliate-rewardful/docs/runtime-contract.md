# Контракт функционального стенда N3, v1

Дата: 2026-09-08. Область: F1, синтетические данные. Это конкретизация общего PRD, а не production payment policy. Владелец разрешил автономную реализацию shared → A → B → C → D. Все суммы ниже в копейках RUB; интерфейс форматирует готовые суммы, не рассчитывает комиссию.

## Минимальный стек и границы

Распределённый монолит: Node.js 22.22.0 / ESM JavaScript API, PostgreSQL 16, отдельные frontend-контейнеры A–D, единая версия релиза и общая схема БД. Это обязательная архитектура `/replicate`, подтверждённая владельцем. Драйвер `pg` с ограниченным пулом и connection timeout; короткие транзакции, блокировка строки tenant для финансовой команды, никаких внешних сетевых вызовов в транзакции. Browser UI — vanilla ES modules; отдельный framework не требуется для текущих задач. SQLite не используется.

Серверные слои: `shared/domain/`, `shared/application/`, `shared/infrastructure/`; вход `apps/api/server.mjs`. Общие browser modules: `shared/contracts/`, `shared/client/`, `shared/ui/`. Каждый `variants/<slug>/app/` владеет только своей композицией. Варианты не импортируют друг друга, server modules, pg, provider SDK. Build проверяет зависимости и собирает статические артефакты; тесты `node --test`. Отсутствие frontend framework не отменяет accessibility и browser acceptance.

Одна серверная БД для всех вариантов в одной среде. Отдельные API tokens/tenant на каждый независимый demo run; пользователь может открыть A из D с тем же token/artifact для handoff. Переключение варианта само по себе не даёт новую роль. Synthetic session bootstrap — явная лабораторная функция, запрещённая вне `N3_MODE=fixture`; production mode пока отказывается запускаться. PostgreSQL не публикует host ports, только `expose: 5432`, и подключён исключительно к отдельной `internal: true` db-сети с API. UI подключён к другой сети API, доступа к db-сети не имеет. Случайный пароль генерируется в gitignored-файл0600, подаётся через Docker secrets / POSTGRES_PASSWORD_FILE; default/пустого пароля нет, без секрета запуск запрещён. Контейнеры приложения непривилегированные; секретов провайдеров нет.

## Время, политика и fixtures

Demo clock стартует `2026-09-03T12:00:00.000Z`; расчётный период `2026-08`, timezone UTC. Период: от первого числа 00:00:00 включительно до следующего месяца исключительно. Ориентир перевода `2026-09-05`, не гарантия банка. В F1 hold=7 суток, окно атрибуции=30 суток, recurring=true; будущие production значения требуют решения владельца. Advance demo clock только вперёд, явно в панели лаборатории.

Cash policy 20% (2000 basis points), credit policy 20%; одна оплата принадлежит одному reward kind и получателю. Новый платёж фиксирует policy version, kind, basis points, attribution, currency, effective/available timestamps. Нельзя сменить их задним числом. Настройка новой политики: kind cash|credit, integer bps 1..10000, windowDays 1..365, holdDays 0..90, recurring boolean; отсутствие/неизвестное значение — ошибка. Округление `floor(amountMinor * bps / 10000)` с безопасным целым результатом. Верхняя сумма платежа 100000000 minor; без float денег.

Seed содержит две cash-персоны Анна/Илья и одну credit-персону Мария, другую tenant boundary для негативных тестов; balance примеры создаются через тот же event handler. Payment для Марии 150000 → credit30000, fixture invoice150000 →120000 после credit. Для merchant/partner есть eligible, held и refunded примеры; cash-партнёр без enrollment пока не получает share kit. Seed version `n3-fixture-v1`. Самореферал не начисляется. Explicit promo приоритетен; невалидный явный promo не переключается на cookie. Каждый новый recurring payment id — отдельное начисление.

## Доступ и команды

Сервер выдаёт случайный opaque bearer token с >=256 бит энтропии; в БД хранится только SHA256. Token связывает tenant/run и допустимые actor IDs. Для браузерного F1 тестовый bootstrap может выдать merchant/partner/customer контексты одного synthetic run, но сервер проверяет membership при каждом запросе. Запрос `actorId` никогда не создаёт membership. Отдельные limited tokens используются для отрицательных тестов. Время истечения session 24 часа, grant максимум1 час. На bootstrap лимит, общее число demo runs ограничено; ошибка не создаёт неполный seed.

Единый интерфейс ядра:

```js
const app = await createApplication({ databaseUrl, clock });
const session = await app.createDemo({ variant: 'A', role: 'merchant' });
const result = await app.execute({ token, actorId, grantId }, action, input, idempotencyKey);
await app.close();
```

`createDemo` возвращает runId, token, actors (разрешённые id/role), clock, seedVersion. `execute` сначала проверяет session/membership/grant, затем schema/action; mutating action — одна транзакция и audit. Idempotency key уникален по tenant/actor/action/key, hash input обязателен: другое тело →409, совпадение →тот же результат, после повторной проверки текущих прав. Чтение не требует key. Ошибка имеет `code`, `status`, безопасное `message`; неизвестная операция →400, чужой ресурс →403/404 без данных, expired/revoked →403, conflict →409. Идемпотентный cached result не обходит revoke.

| Action | Scope | Input / result |
|---|---|---|
| `dashboard` | merchant | policy, cash summaries, payment/ledger history, registries, exceptions; no token |
| `program.read` | любой member | current published terms, version, enrollment URL |
| `program.save` | merchant | validated policy → new version; old versions immutable |
| `enrollment.join` | own partner/customer | explicit `consent:true` → one enrollment + personal link |
| `share.read` | own enrolled partner/customer | own referral URL, disclosure; never send |
| `partner.read` | own partner (optional target must match) | own ledger, cash statuses, due date; no other partners |
| `credit.read` | own customer (optional target must match) | held/available/reserved/applied, invoice and explanation |
| `credit.reserve` | customer, direct only | amountMinor, invoiceId → reservation; 0<amount<=available and invoice |
| `credit.resolve` | fixture merchant | reservationId, outcome success|failed|unknown → state; unknown keeps reservation |
| `registry.prepare` | merchant or merchant draft grant | period, optional artifactId → id/revision/hash/sourceVersion/rows/exclusions |
| `registry.read` | merchant / matching merchant read grant | artifactId → exact persisted current artifact |
| `registry.approve` | merchant direct | artifactId/revision/hash → approval + allocations atomically |
| `registry.export` | merchant direct | artifactId/revision/hash → exact approved CSV; no sent status |
| `registry.sent` | merchant direct | artifactId/revision/hash/partnerId/evidence/sentAt → one immutable transfer fact |
| `registry.reconcile` | merchant direct | original artifactId/revision/partnerId/actual amountMinor/evidence/sentAt → exception preserving fact |
| `grant.create` | direct member | role-specific allowed actions, expiresInSeconds1..3600 → grantId, scope, expiry |
| `grant.revoke` | grant owner direct | grantId → revoked; persisted owner artifacts survive |
| `task.create` | valid grant | kind registry|partner|credit, input → taskId/pending; idempotent |
| `task.run` | valid matching grant | taskId → completed/result or failed; canceled immutable |
| `task.read` | owner or valid matching grant | taskId → state/artifact; recheck grant before result |
| `task.cancel` | owner or matching grant | taskId → canceled unless already terminal; no external rollback |
| `fixture.event` | fixture merchant only | verified fixture payment/refund event; no arbitrary network URL |
| `fixture.advance` | fixture merchant only | nonnegative days → clock; invalidates eligibility snapshots |

Fixture agent role allowlists: merchant `dashboard`, `program.read`, `registry.prepare`, `registry.read`; partner `program.read`, `partner.read`, `share.read`; customer `program.read`, `credit.read`, `share.read`. Grant cannot contain approve/export/sent/credit.reserve/enrollment.join or grant-management. Task actions require matching task grant and tenant. UI approval uses direct owner context, never grant token. F1 tool harness routes UI/MCP/A2A labels to same execute; protocol semantics verified later separately.

## Payment и refund

Trusted fixture adapter supplies confirmed status; unverified/unknown event throws before inbox claim. Payment fields: stable provider/account/object id, customerId, beneficiaryId, kind, amountMinor, paidAt, optional promo/cookie attribution. Duplicate provider business id returns original result; changed payload rejects. New payment creates one immutable positive ledger entry per kind/policy. Refunded payment replay never restores original balance. Invalid/no attribution yields an explained zero-reward outcome, never silent fallback.

Refund identity distinct and stable, partial amount positive and cumulative <= original gross. If refund arrives before payment, store pending fact with no reward; on payment atomically apply queued refunds. Reversal at cumulative refund R: floor(P*bps/10000) - floor((P-R)*bps/10000); incremental reversal is difference from already reversed total. Each refund adds immutable negative ledger entry once. Cash reversal after sent creates reconciliation/debt exception; do not auto-offset future commissions. Applied-credit reversal creates visible exception/negative adjustment; cannot turn into cash. Unknown provider state never consumes confirmed event identity.

## Registry и allocation lifecycle

Ledger sourceVersion increases on monetary/eligibility changes. Registry rows are immutable snapshots; current revision separate from revision history. Prepare for selected month aggregates eligible unsent cash only, excluding held, credit, future, already allocated/sent, disputed negative amounts; explain each exclusion. Stable logical artifact per request/task, optional same artifactId creates revision when snapshot differs; same content returns same revision/hash. Revision hash is SHA256 of canonical content including sourceVersion, policy versions, period and sorted rows/exclusions.

Approval checks exact revision/hash and current sourceVersion then claims every positive obligation via unique allocation ownership in one transaction. Competing registry cannot claim same obligation. Export rechecks source, approval, version and hash; returns safe CSV (formula-leading values escaped), never marks sent. Recalculation/new source invalidates approvals and releases only unsent allocations; sent allocations and transfer facts remain forever. A refund transaction performs invalidation before commit. Prepared registry historical bytes remain available for reconciliation.

Normal `registry.sent` checks current approval/source and remaining allocated partner row; requires evidence/date (not later than demo clock) and inserts unique transfer fact per allocated obligation. Repeat with a new command key cannot increase paid amount; mixed partial partner sends preserve sent rows. Stale CSV already used in the real world is represented by `registry.reconcile`, not silently rejected: record original revision/actual amount/evidence and discrepancy as one unique reconciliation fact, do not authorize another payment or free sent obligations. F1 contains only simulated facts, prominently labelled. No route sends bank money.

## Credits и tasks

Credit balance computed only from credit ledger, minus successful applications and active unknown/pending reservations. Reservation transaction checks current available balance and invoice remaining, inserts once; concurrent reserve cannot exceed either. Unknown billing outcome retains original reservation; known failed releases exactly once; success applies exactly once and reduces invoice. Conflicting terminal resolve fails, replay returns existing result. Late refund may create negative adjustment/exception but does not rewrite prior invoice.

Tasks persist id/tenant/subject/grant/kind/input/state/result. Task run checks canceled/terminal and current grant before execution and before result publication; task result references the same registry, no private financial copy. Different task IDs never accept each other's responses. For fixture deterministic runner, no LLM is called; usage null (not zero measured). `task.cancel` prevents future execution/publication, owner may still inspect existing artifact by independent direct rights.

## HTTP и embed boundary

JSON POST `/api/demo` creates synthetic run; `/api/command` calls execute. Bearer in Authorization only, never URL/log. Body limit64KiB, allowlisted methods/content types, strict CORS origin list for local variant hosts; no wildcard credentials. F1 binds only loopback defaults. UI escapes untrusted strings; no dynamic code evaluation. No arbitrary upload/URL-fetch command. Health only mode/version, no DB contents.

B can be embedded via iframe; host CSS cannot cross. Parent/child messages validate exact origin, source and message schema; token never in query. Demo host can create separate customer session explicitly, but no enrollment without button consent. Test on a different port with hostile CSS and CSP restricting frame/script/connect origins. Refusal and retry states must remain visible. Production cross-site identity handoff/OAuth is deferred and labelled.

## Обязательные доказательства

All60 PRD scenarios traced to per-feature AC/test. Tests: tenant+subject deny, schema/prototype injection, session limit, duplicate/concurrent event, renewal, pending-refund, cumulative rounding, timeout retry, post-sent refund, competing approval, stale export, mixed sent rows, old-CSV reconciliation, concurrent credit reserve, terminal billing, revoked/expired grant, cancel/late task, restart persistence, isolation and A↔D handoff. Mutation guards on tenant deny, stale-source guard and duplicate payment. Four real browser journeys at390/1440; B foreign-origin CSS/CSP/CORS; build and exact artifact snapshot.

Source capture restrictions remain in source-product-profile.md. Provider integrations stay unavailable in F1. Documentation-only YooKassa/CloudPayments adapters require primary docs and separate contract tests before F2; no invented sandbox claims.


## F2 extension — 2026-09-09

F2 implementation adds real identity, dedicated YooKassa order/verified-event integration and MCP/A2A transport. Deployment mode `hybrid` serves isolated fixture demos and real `/account` workspaces; `real` disables fixture routes. Real tenant/session authority never comes from demo bootstrap. Current implementation/setup and honest external acceptance limits: [F2 operations](f2-operations.md). Earlier F1-only statements describe the prior accepted milestone, not the new mode. F2 final browser acceptance is recorded separately in its completion/telemetry.
