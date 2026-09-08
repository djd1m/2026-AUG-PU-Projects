# Pseudocode — N3

Контракты данных, API, алгоритмов и ошибок: [runtime-contract](runtime-contract.md). Этот каталог объединяет алгоритмы feature specifications. PostgreSQL transactions use same client; lock tenant before mutable state.

### Algorithm: US-001 ограничение доступа
REQUIREMENT: `FR-shared-core-1`
REQUIREMENT: `AC-shared-core-11`
REQUIREMENT: `AC-shared-core-12`
REQUIREMENT: `AC-shared-core-13`
REALISES: SC-US-001-1, SC-US-001-2, SC-US-001-3
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Resolve opaque token → tenant and membership; reject requested actor outside membership. Resolve resource only within tenant. Apply role allowlist and own-subject equality. If grant supplied, intersect with direct permissions and recheck expiry/revoke before cached or new result. Never use UI variant as authority.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-002 атрибуция и повторные оплаты
REQUIREMENT: `FR-shared-core-2`
REQUIREMENT: `AC-shared-core-21`
REQUIREMENT: `AC-shared-core-22`
REQUIREMENT: `AC-shared-core-23`
REQUIREMENT: `AC-shared-core-24`
REALISES: SC-US-002-1, SC-US-002-2, SC-US-002-3, SC-US-002-4
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Verify fixture source first; unknown throws before inbox. Lock tenant; unique provider payment identity; compare payload hash on replay. Resolve promo before cookie, invalid explicit denies attribution. New recurring id yields new payment with historical policy; insert reward only once; apply pending refunds in the same transaction.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-003 объяснимое вознаграждение
REQUIREMENT: `FR-shared-core-3`
REQUIREMENT: `AC-shared-core-31`
REQUIREMENT: `AC-shared-core-32`
REQUIREMENT: `AC-shared-core-33`
REALISES: SC-US-003-1, SC-US-003-2, SC-US-003-3
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Store integer minor-unit entries, kind and source references immutably. For cumulative refunds compute remaining gross reward and append delta reversal; never overwrite earned entry. Cash and credit projections separate. If sent/applied obligation reversed, append exception; keep old transfer/invoice fact.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-004 ручной месячный реестр
REQUIREMENT: `FR-shared-core-4`
REQUIREMENT: `AC-shared-core-41`
REQUIREMENT: `AC-shared-core-42`
REQUIREMENT: `AC-shared-core-43`
REQUIREMENT: `AC-shared-core-44`
REQUIREMENT: `AC-shared-core-45`
REQUIREMENT: `AC-shared-core-46`
REQUIREMENT: `AC-shared-core-47`
REQUIREMENT: `AC-shared-core-48`
REALISES: SC-US-004-1, SC-US-004-2, SC-US-004-3, SC-US-004-4, SC-US-004-5, SC-US-004-6, SC-US-004-7, SC-US-004-8
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Lock tenant and resolve current sourceVersion. Prepare immutable revision with eligible unsent cash and exclusions. Approve exact id/revision/hash/source and claim unique allocations atomically. Export only approved fresh snapshot. Record sent once with operator/evidence. Refund invalidates approval and releases unsent only; stale external transfer is separate reconciliation fact.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-005 одинаковые действия UI и агентов
REQUIREMENT: `FR-shared-core-5`
REQUIREMENT: `AC-shared-core-51`
REQUIREMENT: `AC-shared-core-52`
REQUIREMENT: `AC-shared-core-53`
REQUIREMENT: `AC-shared-core-54`
REALISES: SC-US-005-1, SC-US-005-2, SC-US-005-3, SC-US-005-4
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Create scoped expiring grant within actor allowlist. Task uses same execute and persisted artifact. Check grant before steps/result; revoke stops subsequent access. Owner may read artifact independently. Cancel terminal task cannot accept late response or advance another task ID.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-006 сравнение без перемешивания данных
REQUIREMENT: `FR-shared-core-6`
REQUIREMENT: `AC-shared-core-61`
REQUIREMENT: `AC-shared-core-62`
REQUIREMENT: `AC-shared-core-63`
REALISES: SC-US-006-1, SC-US-006-2, SC-US-006-3
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Create fresh tenant/run with pinned seed; bind opaque token and actors. All queries/commands use authenticated tenant. New experiment clone does not share balances; explicit handoff carries existing token/artifact without reset. One production environment has one API/ledger; production mode is unavailable in F1.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-101 Настроить программу
REQUIREMENT: `FR-a-merchant-101`
REQUIREMENT: `AC-a-merchant-1011`
REQUIREMENT: `AC-a-merchant-1012`
REALISES: SC-US-101-1, SC-US-101-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Render programme form from program.read. Validate required kind/bps/window/hold/recurring server-side. program.save appends policy version. Display returned current terms and version; invalid input remains in form with error.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-102 Проверить начисление
REQUIREMENT: `FR-a-merchant-102`
REQUIREMENT: `AC-a-merchant-1021`
REQUIREMENT: `AC-a-merchant-1022`
REALISES: SC-US-102-1, SC-US-102-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Fixture lab submits confirmed payment using stable identity to shared handler. dashboard displays source/policy/amount/hold. Refund adds adjustment; replay same payment returns prior event without undoing refund. Refresh retrieves persisted server state.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-103 Закрыть месяц
REQUIREMENT: `FR-a-merchant-103`
REQUIREMENT: `AC-a-merchant-1031`
REQUIREMENT: `AC-a-merchant-1032`
REALISES: SC-US-103-1, SC-US-103-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Owner chooses month, prepares artifact, reads exclusions, approves exact revision/hash, downloads server CSV. UI keeps exported separate from sent; explicit evidence/date then registry.sent; display operator/time and no claim of bank receipt.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-104 Пригласить и передать работу агенту
REQUIREMENT: `FR-a-merchant-104`
REQUIREMENT: `AC-a-merchant-1041`
REQUIREMENT: `AC-a-merchant-1042`
REALISES: SC-US-104-1, SC-US-104-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: program.read returns enrollment URL distinct from personal referral URL. Copy only after click. Handoff from D opens persisted artifact in A using owner context and identical id/revision/hash; no new bootstrap when valid handoff provided.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-201 Предложить участие вовремя
REQUIREMENT: `FR-b-customer-201`
REQUIREMENT: `AC-b-customer-2011`
REQUIREMENT: `AC-b-customer-2012`
REALISES: SC-US-201-1, SC-US-201-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Render value moment and invitation, with decline action preserving parent product. Do not join on load/read. Explicit consent calls enrollment.join once for own customer. Display participation status from server.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-202 Получить бонус за оплату
REQUIREMENT: `FR-b-customer-202`
REQUIREMENT: `AC-b-customer-2021`
REQUIREMENT: `AC-b-customer-2022`
REALISES: SC-US-202-1, SC-US-202-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Only fixture confirmed payment attributed to distinct enrolled customer causes credit reward with hold. Click/signup/unverified/self-referral produces no available bonus. credit.read explains pending/held/rejected source.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-203 Использовать баланс
REQUIREMENT: `FR-b-customer-203`
REQUIREMENT: `AC-b-customer-2031`
REQUIREMENT: `AC-b-customer-2032`
REQUIREMENT: `AC-b-customer-2033`
REALISES: SC-US-203-1, SC-US-203-2, SC-US-203-3
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Reserve credit in transaction after both available balance and invoice remaining checks. Concurrent requests cannot overspend. Unknown billing retains same reservation; success applies once, known failure releases once. Render server invoice and separate reservation/applied states.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-204 Рекомендовать через удобный канал
REQUIREMENT: `FR-b-customer-204`
REQUIREMENT: `AC-b-customer-2041`
REQUIREMENT: `AC-b-customer-2042`
REALISES: SC-US-204-1, SC-US-204-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Only enrolled own customer receives personal link and disclosure. Share/copy is user initiated, no external send. Read-only grant cannot enroll/reserve; wrong role cannot view owner billing. Foreign-origin iframe isolates CSS and restricts postMessage origin/source/schema.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-301 Понять условия до вступления
REQUIREMENT: `FR-c-partner-301`
REQUIREMENT: `AC-c-partner-3011`
REQUIREMENT: `AC-c-partner-3012`
REALISES: SC-US-301-1, SC-US-301-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Read published programme terms before enrollment. Show policy rate/window/hold/due date/version. Existing ledger entries retain their policy version even after current policy changes; public terms omit private ledger.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-302 Вступить и получить ссылку
REQUIREMENT: `FR-c-partner-302`
REQUIREMENT: `AC-c-partner-3021`
REQUIREMENT: `AC-c-partner-3022`
REALISES: SC-US-302-1, SC-US-302-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Validate explicit consent and own actor. Unique tenant/actor enrollment returns same record across retries. Personal referral URL and promo differ from programme enrollment URL. Share kit contains reward disclosure and no auto-send.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-303 Понять свою выплату
REQUIREMENT: `FR-c-partner-303`
REQUIREMENT: `AC-c-partner-3031`
REQUIREMENT: `AC-c-partner-3032`
REALISES: SC-US-303-1, SC-US-303-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Authorize own partner projection; show only own entries and transfer facts. Explain hold/refund/period and due date. Owner sent record changes partner status after refresh; bank credited remains unknown.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-304 Спросить своего агента
REQUIREMENT: `FR-c-partner-304`
REQUIREMENT: `AC-c-partner-3041`
REQUIREMENT: `AC-c-partner-3042`
REALISES: SC-US-304-1, SC-US-304-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: UI and delegated channel call same partner.read. Enforce actor/target equality; changing target ID or requesting global registry denied before data projection. Return source timestamp and same own amount.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-401 Делегировать задачу
REQUIREMENT: `FR-d-agent-401`
REQUIREMENT: `AC-d-agent-4011`
REQUIREMENT: `AC-d-agent-4012`
REALISES: SC-US-401-1, SC-US-401-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Direct owner selects role-scoped read/draft actions and bounded expiry. Server intersects allowlist; no approve/send. Render grant scope and expiry. Revoke/expiry denies subsequent delegated call while direct owner remains valid.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-402 Получить один результат
REQUIREMENT: `FR-d-agent-402`
REQUIREMENT: `AC-d-agent-4021`
REQUIREMENT: `AC-d-agent-4022`
REALISES: SC-US-402-1, SC-US-402-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Create persisted logical task under grant; repeated idempotency key returns same task. Execute registry.prepare in shared layer; returns exact artifact. Refund changes source; prepare same artifact creates new unapproved revision and updated explanations.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-403 Проверить и продолжить вручную
REQUIREMENT: `FR-d-agent-403`
REQUIREMENT: `AC-d-agent-4031`
REQUIREMENT: `AC-d-agent-4032`
REALISES: SC-US-403-1, SC-US-403-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Owner reads exact artifact independently, then approves and exports direct. Grant never approves. Handoff sends artifact reference to A with same owner session, including after revoke; A reads current revision instead of reseeding.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-404 Вести задачу между агентами
REQUIREMENT: `FR-d-agent-404`
REQUIREMENT: `AC-d-agent-4041`
REQUIREMENT: `AC-d-agent-4042`
REALISES: SC-US-404-1, SC-US-404-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Own partner task id is unique and persisted. Retry same key returns same task. Cancel prevents run/result publication; T1 late result cannot complete T2. Completed external facts are not rolled back by task cancellation.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: US-405 Личный кредит клиента
REQUIREMENT: `FR-d-agent-405`
REQUIREMENT: `AC-d-agent-4051`
REQUIREMENT: `AC-d-agent-4052`
REALISES: SC-US-405-1, SC-US-405-2
INPUT: Authenticated actor context and schema-validated command; frozen F1 policy.
OUTPUT: Authorized result or typed error without partial mutation.
STEPS: Customer grant permits own credit.read and returns same projection as B. UI explains available/reserved/held. Attempt credit.reserve under read-only grant fails without balance change; cash ledger never included.
COMPLEXITY: O(n) in affected tenant rows; bounded F1 datasets and database statement timeout.

### Algorithm: FR-GROWTH-001 delivery
REQUIREMENT: `FR-GROWTH-001`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Показывать one-click share только после зафиксированного value moment выбранного продукта и требовать явное подтверждение пользователя; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-GROWTH-002 delivery
REQUIREMENT: `FR-GROWTH-002`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Хранить атрибуцию pending до подтверждённой оплаты; повтор события не создаёт вторую комиссию; refund отражается в ledger; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-GROWTH-003 delivery
REQUIREMENT: `FR-GROWTH-003`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Показывать attribution badge на бесплатном/пилотном portal; снятие доступно только в выбранном paid tier; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-GROWTH-004 delivery
REQUIREMENT: `FR-GROWTH-004`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Выдавать персональную ссылку и промокод; считать по ним отдельные когорты до paid conversion; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-GROWTH-005 delivery
REQUIREMENT: `FR-GROWTH-005`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Встроить enrollment/мини-dashboard N3 в initial-client UI через tenant-safe SSO, сохраняя standalone кабинет; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-GROWTH-006 delivery
REQUIREMENT: `FR-GROWTH-006`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Показывать партнёру неизменяемый commission ledger с event source, суммой, причиной коррекции и отдельным payout status; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-LOOK-001 delivery
REQUIREMENT: `FR-LOOK-001`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Сохранить Rubik, slate text, синий #0087ee и белую основу; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-LOOK-002 delivery
REQUIREMENT: `FR-LOOK-002`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Сохранить двухколоночную композицию hero и CTA с radius5px; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-LOOK-003 delivery
REQUIREMENT: `FR-LOOK-003`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Разделить маркетинговый вход и рабочий кабинет; не приписывать реконструкцию прямой съёмке; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-LOOK-004 delivery
REQUIREMENT: `FR-LOOK-004`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Показать события, комиссию и отправку выплаты раздельно; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

### Algorithm: FR-LOOK-005 delivery
REQUIREMENT: `FR-LOOK-005`
INPUT: Authenticated role projection and explicit user action.
OUTPUT: Traceable interface behaviour.
STEPS: Все три варианта доступны на desktop/mobile и с клавиатуры; route all state changes through common application. Preserve source provenance and fixture-only labels.
COMPLEXITY: O(n) projected rows.

## Scenario Coverage
Scenarios in Specification.md: 60 · claimed by an algorithm: 60
Not claimed by any algorithm:
none
Claimed by an algorithm but absent from Specification.md:
none
