# Requirements Testability Analysis
Spec revision: sha256:937b23634f89f589a7cd8e6e5c0afd6f3b1ad0bfc8c3e102363d9ca4e9a9fbc4

RUN_ID: 20260910T071401Z-agent-payments-implementation-7e80
WORK_UNIT_ID: validate
Scope: independent PLAN validation only. No implementation, test execution, release readiness or provider acceptance is asserted.
Inputs: 01_specification.md, 02_pseudocode.md, 03_architecture.md, 04_refinement.md, 05_completion.md, plan.md and modular-architecture.md in projects/01-testimonials-senja/docs/features/agent-purchase.

## Summary
- Stories analyzed: 2; acceptance criteria mapped: 12/12.
- Average rubric score: 80.5/100 including specific security bonus; no score-based or blocking-floor failures.
- Verdict: REVIEW — requirements are implementable, with the concrete integration ownership decisions below required before shared billing integration. The AC7 and AC11 wording findings were corrected by the integration owner and the current specification bytes were re-read. Independent core/reference-host work can proceed. No release approval.
- XL is appropriate: money, authorization, database concurrency, provider and cross-project attribution.
- Existing human CJM preservation is a release invariant, including projects beyond P1/P2/N3 when shared infrastructure or root tooling changes.

## Results
| Story | Title | Score | INVEST | SMART | Status |
|-------|-------|-------|--------|-------|--------|
| US-001 | Controlled agent purchase | 81/100 | 30/50; 3 full, 1 partial, 2 fail | 26/30; measurable partial | REVIEW |
| US-002 | Extractable module and human compatibility | 80/100 | 34/50; 3 full, 2 partial, 1 fail | 21/30; measurable partial, timing absent | REVIEW |

Scores are judgement of requirements quality, not measured implementation quality. US-001 covers AC2–10 and AC12; US-002 covers AC1, AC10–12. Shared AC are intentionally relevant to both stories.

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-agent-purchase-1 | SC-US-001-1 — Independent module and second host with different product policy |
| AC-agent-purchase-2 | SC-US-001-2 — Human-confirmed one-use pairing and scoped grant rejection |
| AC-agent-purchase-3 | SC-US-001-3 — Grant or saved method alone cannot authorize execute |
| AC-agent-purchase-4 | SC-US-001-4 — Authoritative immutable quote and pre-payment attribution |
| AC-agent-purchase-5 | SC-US-001-5 — Assisted first purchase awaits verified PSP result |
| AC-agent-purchase-6 | SC-US-001-6 — Bounded renewal in final three days and monthly calendar cap |
| AC-agent-purchase-7 | SC-US-001-7 — Concurrent agents/UI share business key, reservations and dispatch fence |
| AC-agent-purchase-8 | SC-US-001-8 — Verified settlement commits once through webhook, poll and replay |
| AC-agent-purchase-9 | SC-US-001-9 — N3 outage and cumulative partial refunds preserve payment and other periods |
| AC-agent-purchase-10 | SC-US-001-10 — MCP/A2A policy parity and persisted task recovery |
| AC-agent-purchase-11 | SC-US-001-11 — Existing human journeys work with feature disabled and enabled |
| AC-agent-purchase-12 | SC-US-001-12 — Isolated TEST deployment and separately recorded real provider acceptance |

## INVEST and SMART analysis
| Criterion | US-001 | US-002 | Evidence and limitation |
|-----------|--------|--------|-------------------------|
| Independent /8 | 0 | 0 | Grant, mandate, provider and host settlement depend on each other; compatibility depends on integration. Splitting internal modules does not make business stories independent. |
| Negotiable /8 | 8 | 8 | Ports, containers and SDK implementation remain adaptable inside approved money/consent boundaries. |
| Valuable /10 | 10 | 10 | User-controlled purchasing and reusable module without human regression are explicit benefits. |
| Estimable /8 | 4 | 4 | Scope bounded, but target client, numeric pairing/rate limits and field ownership still need concretization. |
| Small /8 | 0 | 4 | US-001 is a multi-stage XL epic; US-002 is smaller but cross-host proof is substantial. These are not both sprint-sized stories. |
| Testable /8 | 8 | 8 | Exact AC quotations below provide observable pass/fail outcomes; table above maps every AC. |
| Specific /6 | 6 | 6 | Named actors, identities, resources and states; semantic ambiguities are called out separately below. |
| Measurable /8 | 4 | 4 | Currency/window/consent limits concrete; request timeouts, rate threshold and recovery deadline not fixed. |
| Achievable /6 | 6 | 6 | Library-in-backend and separate gateway fit source structure; real PSP acceptance explicitly deferred. |
| Relevant /5 | 5 | 5 | All criteria map to purchase authority, delivery or compatibility. |
| Time-bound /5 | 5 | 0 | US-001 specifies 30 days, last 3 days, calendar month and max 90-day consent. US-002 gives no transport recovery or regression response-time bound. |
| Traceability /10 | 10 | 10 | This report, section Criterion scenarios, maps all 12 AC identifiers to named scenarios. |
| Completeness /10 | 10 | 10 | Exact quoted criteria below cover happy path, failures, ownership, concurrency and boundary cases. |
| Security bonus | +5 | +5 | Grants, consent, tenant/account/mode binding, secret isolation, TEST-only and negative cases are specific. |
| Growth bonus | +0 | +0 | Project docs/product-discovery-brief.md is absent; per skill an absent brief is +0. Existing badge/attribution must still be preserved. |

Totals: US-001 = 30 + 26 + 20 + 5 = 81. US-002 = 34 + 21 + 20 + 5 = 80. No Testable, Completeness or Traceability floor is zero. A positive score does not waive the following integration constraints.

## Concrete findings and fixes

### V-01 — RESOLVED in revised AC7; retain integration tests for lawful repeated human purchases
Evidence: apps/web/src/app/api/checkout/route.ts explicitly describes each second deliberate human checkout as a legal new purchase and creates a new idempotence key. AC7 includes UI in same-resource/same-period exclusion. Refinement permits an explicit human purchase after the monthly automated budget is exhausted. A naive universal month/period uniqueness check or mandatory automated-budget check on the human route would regress existing CJM.
Current AC7 explicitly resolves the requirement ambiguity: manual additional periods stay allowed, manual spending is visible to autonomous admission, and agent caps never deny confirmed human purchases. Implementation follow-through: define billing-period identity and admission ownership. An in-flight automatic renewal and a concurrent UI action for that same renewal share one operation; after its outcome is reconciled, a separately confirmed additional human purchase allocates a new entitlement period. Agent spend caps remain non-widenable and manual checkout does not require an agent grant or mandate. Record manual purchases in the observed ledger while leaving confirmed human purchases outside automated authorization limits, as revised AC7 now requires. Add one test for racing UI/agent renewal and a distinct test for two deliberate manual purchases extending two periods with module on and off.

### V-02 — HIGH integration condition: make cutover and lock ownership concrete
Evidence: apps/web/src/lib/n3-payment.ts applyBridgePayment already locks project then intent; applyTariffUpgrade locks project/checkout, claimWebhookEvent deduplicates the paid event and enqueueN3 runs in the same supplied PoolClient. modular-architecture.md expressly requires an ownership table before connecting the new checkout but does not yet contain that table. A second reducer or inverted lock order can double-extend or deadlock.
Fix before host integration: write the actual field/event owner table, new-order↔legacy-intent unique mapping and lock sequence covering reservation, revoke, project, intent and checkout. Supply the existing physical PoolClient to fulfillment. Ensure early webhook and normal execute settlement converge on that owner. Add transaction rollback, duplicate-event and concurrent settlement tests with real PostgreSQL. Queue insertion failure may abort settlement for retry, but remote N3 unavailability must not revoke a committed paid tariff.

### V-03 — MEDIUM: pin transport and auth conformance parameters
AC10 refers to a target configured MCP SDK client and A2A client without naming client/version; pairing expiry, quote TTL and rate threshold are configurable but unspecified. Fix: select SDK test client and A2A protocol version, freeze DTO/error behavior, configure explicit finite TTLs and rate windows, and use a fake clock to test exact boundaries. Test clients must exercise real protocol framing rather than directly call core functions. SDK conformance alone must not be described as compatibility with every end-user MCP host.

### V-04 — RESOLVED in revised AC11; collect the required all-project evidence
Revised AC11 now covers every other existing project with unchanged-source/deployment evidence and deployed course UI smoke. Implementation follow-through: document impact inventory for projects 01–08 and any additional project directories; capture unchanged source/deployment evidence for unaffected projects. For any shared tooling/network/configuration change, run affected project smoke. Do not redeploy unaffected projects to collect evidence. P1 enabled/disabled must cover signup/login, verified email, collection/moderation/widget, manual checkout/refunds and partner dashboard where applicable.

### V-05 — LOW: remove stale approval labels
plan.md still says plan for approval and proposals although 01_specification.md records approval. Fix status text when integrating report so subsequent stages do not unnecessarily request owner approval again. User approval in the active task is authoritative.

### V-06 — Commission ownership: external N3 commission must not also run native conversion
Confirmed source boundary: applyBridgePayment queues verified payment/refund through enqueueN3, and bridgeNotification owns matching bridge invoices. Native convertAttributionOnPayment in api/webhooks/payment/route.ts belongs to the ordinary native branch. Its absence inside n3-payment.ts is intentional, not a defect. Adding native commission conversion to a bridge settlement would create a second commission path. Preserve exactly one attribution/commission owner per order and test bridge replay never inserts a native commission.

## Additional executable scenario specifications
These are required test designs, not executed tests. The exact primary Given/When/Then scenarios are quoted in the next section.

```gherkin
Scenario: Auth bypass cannot turn a gateway service credential into buyer authority
  Given the gateway is authenticated but has no valid scoped buyer grant
  When it requests a private order or executes a payment
  Then access is denied and no provider request or reservation is created

Scenario: Pairing injection is data and referral URL cannot become SSRF
  Given a pairing display name contains an HTML event handler and referral URL targets a private address
  When the human opens the pairing page and the agent attaches attribution
  Then the name renders as text and the URL is rejected without an outbound request
  And malformed money or SQL metacharacters cannot alter stored authority

Scenario: Cross-tenant guessed identifiers cannot read or mutate payment state
  Given merchant A buyer A has a valid grant and merchant B owns an order and saved method
  When buyer A supplies either identifier to status or execute
  Then no B data is returned and no payment request is sent

Scenario: Pairing brute force and replay remain bounded
  Given configured pairing threshold N in window T and a one-use expiring pairing code
  When N plus one invalid confirmations are submitted and a confirmed code is replayed
  Then excess requests are rate-limited and replay creates no grant
  And an expired code or missing CSRF token cannot issue authority

Scenario: A saved-method refusal preserves the original assisted purchase
  Given a verified successful first payment with saved method false
  When settlement completes and a renewal is requested
  Then the purchased tariff remains active and renewal requires human action

Scenario: Unknown provider result remains reserved past provider idempotency expiry
  Given an accepted dispatch loses its response and the worker restarts
  When the idempotency window expires and another agent supplies a different request key
  Then the period and money remain reserved and no new create payment request occurs

Scenario: Moscow month boundary is shared across agents and mandates
  Given one month bucket already contains 99000 RUB minor spend and a new grant is issued
  When a renewal is attempted before the next calendar month in Europe/Moscow
  Then autonomous execution is refused even if its 30-day term makes it otherwise eligible
  And a separately confirmed human purchase remains available under V-01

Scenario: Refund arrives before the paid notification
  Given the provider proves the original payment succeeded and a valid partial refund exists
  When refund then paid then duplicate refund events are delivered
  Then one purchase and one refund effect exist and another paid period is preserved
  And cumulative refunded amount never exceeds paid gross and budget does not refill

Scenario: Legacy human journey survives gateway outage
  Given the module is enabled and the gateway is unavailable
  When an existing user logs in, views their widget and performs manual checkout
  Then existing human contracts remain usable without linking or a mandate
```

## Exact acceptance criteria quoted for rubric evidence
Source: 01_specification.md, headings AC-agent-purchase-1 through AC-agent-purchase-12. The following are verbatim specification bytes decoded as UTF-8 at the recorded digest.

> ### AC-agent-purchase-1 — Переносимость
>
> SC-US-001-1: Given independently installed module and two reference hosts with different products, when running contracts/build/tests, then no Proofwall/N3 imports or merchant secrets are required and product amounts remain host-owned.
>
> ### AC-agent-purchase-2 — Полномочия
>
> SC-US-001-2: Given buyer linking in authenticated human UI, when explicit consent is submitted, then scoped expiring agent grant is issued; missing, expired, revoked, foreign or wrong-audience credentials cannot read or mutate another buyer order. Pairing is one-use, CSRF protected and rate-limited.
>
> ### AC-agent-purchase-3 — Поручение
>
> SC-US-001-3: Given a valid agent grant alone or a saved payment method alone, when autonomous execute is requested, then no provider call occurs. Explicit human mandate binds merchant, buyer, resource, product, currency, terms, validity and amount/period limits; agent input cannot widen it.
>
> ### AC-agent-purchase-4 — Подготовка
>
> SC-US-001-4: Given authorized verified buyer and owned resource, when preparing purchase, then server snapshots current price and expiry, resolves required attribution before checkout and creates no charge. Modified, expired or foreign quote refuses execution.
>
> ### AC-agent-purchase-5 — Первая покупка
>
> SC-US-001-5: Given no autonomous mandate, when agent requests payment, then response requires authenticated human confirmation and provider-hosted payment; browser return or agent claim never marks paid. No PAN/CVV/OTP or raw saved method appears in tools or logs.
>
> ### AC-agent-purchase-6 — Повтор
>
> SC-US-001-6: Given saved method plus valid mandate and grant, when renewal falls within authorized window, then provider receives one scoped request; changed price, terms, currency, resource, mode or account blocks it. P1 policy is 99000 minor RUB, 30 days, last 3 days, at most 99000 per calendar month Europe/Moscow, max 90 days consent.
>
> ### AC-agent-purchase-7 — Конкуренция
>
> SC-US-001-7: Given concurrent agents or UI attempting same resource billing period using distinct keys, when dispatched, then one logical renewal is not charged twice; explicitly confirmed manual purchase of an additional period remains allowed without agent mandate. Manual spending is visible to autonomous budget admission but the agent cap never denies an explicitly confirmed human purchase; all agent grants/mandates share persisted budget. Same key/different payload conflicts, revoke before fence prevents dispatch, restart or lost response holds reservation for reconciliation.
>
> ### AC-agent-purchase-8 — Расчёт
>
> SC-US-001-8: Given verified matching PSP success, when webhook/poll/replay arrives, then payment/financial ledger/outbox and local entitlement commit once. Forged shop/mode/amount/status cannot settle. Unknown result cannot create fresh charge, cancellation of MCP/A2A task cannot cancel accepted payment.
>
> ### AC-agent-purchase-9 — Рефералы и возвраты
>
> SC-US-001-9: Given successful order and optional attribution adapter, when N3 unavailable or partial refund repeated/out of order, then paid status persists, durable delivery retries, one cumulative correction is sent, another paid period is preserved and refund does not refill budget.
>
> ### AC-agent-purchase-10 — Транспорты
>
> SC-US-001-10: Given target configured MCP SDK client and A2A client, when offer/order/execute/status commands are called, then both use same backend policy and persisted state; restart/replay returns same order. Gateway has no database or provider credential and never grants buyer authority itself.
>
> ### AC-agent-purchase-11 — Человеческий CJM
>
> SC-US-001-11: Given existing human users with agent feature disabled or enabled, when signup/login/email proof/manual checkout/refund/partner dashboard run, then no agent linking or mandate is required and existing outputs remain compatible. Browser E2E covers P1→N3 A–D; P2 sources/deployment unchanged and smoke remains available; every other existing project has unchanged-source/deployment evidence, with browser smoke for deployed course UIs discovered in the runtime inventory.
>
> ### AC-agent-purchase-12 — Изоляция и выпуск
>
> SC-US-001-12: Given TEST deployment, when compose/security checks and agent UI E2E execute, then no public database port or default secret exists, project networks remain separate and live charging is refused by new adapter. Real TEST saved-method purchase is a separately recorded provider acceptance step; mock tests cannot claim it.
>

## Evidence limits and handoff
Read-only source inspection validates the integration risks; no repository file was changed. Root/project CLAUDE, applicable complexity/security/testing rules, requirements-validator skill, scoring-system and feature-report-contracts were read. Existing security.md HMAC guidance is superseded for this provider by payment.ts's documented D-009 provider-specific re-fetch approach; do not introduce a fictional signature requirement. No current provider claims were independently revalidated in this bounded review.

The existing completion document correctly says NOT IMPLEMENTED and contains no invented test coverage. Before acceptance it must receive actual test files/titles for all 12 criteria; provider acceptance remains separately evidenced. Required full regression, browser, PostgreSQL, mutation and protocol gates have not been run by this validator.

Profile: inherited parent XL routing; actual model/effort, token usage and cost are unavailable to this work unit as host billing metadata, and are not inferred from self-identification. Parent run telemetry must record delegation timing and receipt. Receipt timestamp: 2026-09-10T07:21:54.938807+00:00 .
Status: completed
