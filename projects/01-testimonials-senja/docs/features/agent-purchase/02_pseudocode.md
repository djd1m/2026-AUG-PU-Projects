# Pseudocode — agent-purchase

## Data Structures

Canonical fields and entities: [modular architecture](modular-architecture.md). Every stored entity carries id, merchant scope and created_at. No raw credentials in public DTO.

## Core Algorithms

### Algorithm: Переносимость

REQUIREMENT: `AC-agent-purchase-1`
REALISES: SC-US-001-1
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Publish only contracts and adapter exports; build in isolated reference host; inject host offer, identity, fulfillment and optional attribution; fail unsupported capabilities.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Полномочия

REQUIREMENT: `AC-agent-purchase-2`
REALISES: SC-US-001-2
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Issue random one-use pairing; human session+CSRF+rate limit confirms buyer/resource; store hash-only bearer grant with audience/expiry; resolve authority from database for every command; fail closed on mismatch/revoke.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Поручение

REQUIREMENT: `AC-agent-purchase-3`
REALISES: SC-US-001-3
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Human authenticated POST records versioned consent separately from grant; server bounds policy and stores method binding. execute requires grant AND mandate AND method; no model-approved boolean accepted.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Подготовка

REQUIREMENT: `AC-agent-purchase-4`
REALISES: SC-US-001-4
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Host resolves current offer and product ownership; persist immutable quote/expiry. Required attribution verified outside SQL then bound by unique local intent. Execute revalidates current offer against snapshot.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Первая покупка

REQUIREMENT: `AC-agent-purchase-5`
REALISES: SC-US-001-5
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Prepare order without calling PSP. Return trusted local human approval URL. Human POST confirms exact order and optionally saving method; PSP creates hosted redirect outside transaction; server polling/webhook verifies final result.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Повтор

REQUIREMENT: `AC-agent-purchase-6`
REALISES: SC-US-001-6
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Host returns current billing-period key and renewal eligibility. Core checks agreed limits and method shop/environment; refuse early/price/terms change. Provider adapter makes TEST saved-method request, retaining stable attempt ID.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Конкуренция

REQUIREMENT: `AC-agent-purchase-7`
REALISES: SC-US-001-7
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Lock merchant/buyer budget and resource period; unique business key supplements request idempotency hash. Reserve under transaction, recheck revoked/expiry at dispatch fence. One dispatch owner; unknown network result never permits fresh attempt. Shared admission prevents replay of the same logical renewal; an explicitly confirmed extra manual period remains allowed without agent mandate. Such manual spend consumes remaining autonomous headroom but agent caps do not deny human purchases.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Расчёт

REQUIREMENT: `AC-agent-purchase-8`
REALISES: SC-US-001-8
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Provider lookup validates amount/currency/account/environment and metadata; transaction finalizes attempt and inserts unique event/outbox; host local fulfillment uses SAME physical connection and legacy idempotent handler. Poll/webhook share reducer. Remote fulfillment uses inbox/outbox and visible pending.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Рефералы и возвраты

REQUIREMENT: `AC-agent-purchase-9`
REALISES: SC-US-001-9
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Host N3 adapter receives stable purchase/refund event outside financial transaction. Durable inbox rejects replay; cumulative refund bounded by paid gross; ledger keeps paid plus separate refunds. N3 outage retries; no budget refill or silent entitlement deletion.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Транспорты

REQUIREMENT: `AC-agent-purchase-10`
REALISES: SC-US-001-10
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Thin MCP/A2A adapters validate protocol envelope and call HTTP command API with service auth plus scoped buyer bearer. Stable task/idempotency identity and order status survive restart. No database network attached to gateway.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Человеческий CJM

REQUIREMENT: `AC-agent-purchase-11`
REALISES: SC-US-001-11
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Agent endpoints additive and feature-gated; old human endpoints retain response/consent requirements. Route new financial effects into one existing tariff/commission handler. Run unchanged human regression suites and browser referral checkout on A-D before deployment; inventory other existing projects, preserve their source/deployment and smoke deployed course UIs.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

### Algorithm: Изоляция и выпуск

REQUIREMENT: `AC-agent-purchase-12`
REALISES: SC-US-001-12
INPUT: authenticated context and validated command.
OUTPUT: domain result or typed refusal.
STEPS: Compose binds only free web ports after checker, database internal-only with random credentials. Adapter hard refuses live; fake PSP isolated. Run concurrent/mutation/integration/browser tests; retain separate real TEST provider receipt or mark external acceptance pending.
COMPLEXITY: bounded database operations per command; outbox processed in bounded batches.

## Scenario Coverage

Scenarios: 12; claimed: 12.
Not claimed: none.
Claims absent from specification: none.

## Error Handling Strategy

Missing authority: 401/403; foreign object: 404; incompatible/replayed payload: 409; action required: structured nextAction; unknown provider result: durable pending reconciliation. Financial state never derives from return URL.
