# Requirements Testability Analysis
Spec revision: sha256:c6b755b35196bd28e58ac54312e7d1f91e865e8306b9a2aca169d0cabf615608

Work unit: n5_credit_plan_validator; phase: VALIDATE; date: 2026-10-26.
Project: /tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus.
Observed repository HEAD: 9ba7a6fa19a3e8abee24eb4b10cbff4b8dea71e5; document source baseline: c559673649460fa5d8ef1e5e3c86bf7053ebbb69. The byte digest above, rather than either historical commit label, binds this review.
Inputs: seven actual credit-packages planner documents, project/root instructions, requirements-validator/SKILL.md, references/scoring-system.md and references/feature-report-contracts.md. No coder conversation, implementation receipts, running services, provider calls or payment transactions were inputs.
Requested model/effort: gpt-6.1-sol/high. Actual host-verified model, effort, tokens and cost: null (no execution metadata exposed). Coordinator owns parent run telemetry; this report is its validation artifact. E2E preflight: not_applicable, requirements-only review.

## Overall verdict
READY WITH CAVEATS for the bounded offline code implementation with default legacy mode and production activation disabled. No requirements defect blocks that scope. This is neither implementation acceptance nor authorization to activate commercial terms. Eight stories, eight AC identifiers and fifteen existing named scenarios were read; the scenario table below has exactly one row per AC. No optional redesign or new external service is needed.

Live acceptance is BLOCKED pending fresh authorized evidence for YooKassa create/re-query/verified fulfillment and model/S3 end-to-end processing (03_architecture.md, External Dependencies: UNCONFIRMED). Local isolated SQL, fakes and UI checks may establish code behavior independently; they cannot close those live requirements. Cloud.ru compatibility, production cohort inventory, activation and real analytics receipts remain separate coordinator-owned stages.

The selected-scope Phase 1 receipt is coordinator-supplied context, not independently re-executed here. Historical aggregate exit 1 remains a failure under the recorded owner exception; this validation does not relabel it.

## Scores and blocking floors
Scores are reasoned rubric judgments, not observed product metrics. INVEST weights are 8/8/10/8/8/8; SMART weights are 6/8/6/5/5; quality weights are 10/10. The same rubric applies to each bounded story: independent existing-system seam, negotiable implementation, explicit user value, estimable contract, and clear testable criteria. Small is conservatively 4/8 because the shared XL financial integration spans several bounded changes and is not proven to fit one sprint. Security is specific (+5), with displayed scores capped at 100. Growth adjustment is +0: this bounded accounting feature introduces no acquisition requirement/seed; no global growth-trace acceptance is claimed.

| Story | INVEST | SMART | Quality | Base score | Security | Final | Verdict |
|---|---|---|---|---|---|---|---|
| US-001 Trial and opt-in | 46/50 | 30/30 | 20/20 | 96 | +5 | 100/100 | READY |
| US-002 Packages and dates | 46/50 | 30/30 | 20/20 | 96 | +5 | 100/100 | READY |
| US-003 Trusted input charge | 46/50 | 30/30 | 20/20 | 96 | +5 | 100/100 | READY |
| US-004 Technical recovery | 46/50 | 30/30 | 20/20 | 96 | +5 | 100/100 | READY |
| US-005 Scheduled Pro | 46/50 | 30/30 | 20/20 | 96 | +5 | 100/100 | READY |
| US-006 Legacy protection | 46/50 | 30/30 | 20/20 | 96 | +5 | 100/100 | READY |
| US-007 Payment/balance trust | 46/50 | 30/30 | 20/20 | 96 | +5 | 100/100 | READY |
| US-008 Expiry recovery/erasure | 46/50 | 30/30 | 20/20 | 96 | +5 | 100/100 | READY |

Mean base score: 96/100; final capped mean: 100/100; blocked by numerical score: 0. High testability is not evidence of implementation correctness or verified external feasibility. Timing is specific through 30-day windows, 24-hour recovery, before-provider ordering, once-only boundaries and concurrent operations; no invented latency target was added.

For every story Testable=8 and Completeness=10 rely on the actual quoted acceptance text below, plus its error/edge scenarios in 01_specification.md and this report. Traceability=10 relies on this report's exact Criterion scenarios table. No floor is zero.

| AC heading in 01_specification.md | Actual acceptance text quoted as scoring evidence |
|---|---|
| AC-credit-packages-1 | “Given20same-email registrations, when they race, then one account and one30credit grant exist; login/payment/renewal adds no trial.” |
| AC-credit-packages-2 | “Given expired base and live add-on, when a new clip renders, then paid rights remain; overlapping windows do not extend each other by summation.” |
| AC-credit-packages-3 | “Given120seconds input, when accepted, then reservation=120units=2credits;121seconds costs121units, never3credits.” |
| AC-credit-packages-4 | “Given zero ready clips, when current terminal failure races first successful output, then exactly one valid settlement/release wins; stale failure cannot refund success.” |
| AC-credit-packages-5 | “Given Start+2addons and a request for immediate20RUBupgrade, when submitted, then it is refused before payment intent/provider call, no money or credits change, and next-period Pro/addon-now actions are shown.” |
| AC-credit-packages-6 | “Given legacy paid/operator accounts and pending old990invoice, when cutover/payment occurs, then original daily/indefinite terms survive and no retroactive credit debit appears.” |
| AC-credit-packages-7 | “Given different SKU with the same idempotency key, forged/unavailable webhook or different provider payment for one fulfilled intent, when processed, then conflict/retry/review applies and no double grant occurs.” |
| AC-credit-packages-8 | “Given an expired source grant and zero-result technical failure, when the code recovery contract applies, then only released units receive24h, original paid-render rights stay pinned and duplicate recovery is impossible.” |

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-credit-packages-1 | SC-US-001-1 — One trial under registration race; SC-US-001-2 — Migration changes no old balances and explicit opt-in is once-only |
| AC-credit-packages-2 | SC-US-002-1 — Exact three SKUs and independent add-on; SC-US-002-2 — Expired/exhausted base with live paid add-on |
| AC-credit-packages-3 | SC-US-003-1 — Exact seconds without minute rounding; SC-US-003-2 — Last-balance atomic reservation |
| AC-credit-packages-4 | SC-US-004-1 — Customer once-only versus provider attempts; SC-US-004-2 — Output/failure fence race |
| AC-credit-packages-5 | SC-US-005-1 — Immediate upgrade refused before payment; SC-US-005-2 — Full-price future Pro serialized once |
| AC-credit-packages-6 | SC-US-006-1 — Historical 990 invoice and protected legacy cohorts |
| AC-credit-packages-7 | SC-US-007-1 — Immutable intent and verified payment identity; SC-US-007-2 — Mobile shortage and future renewal truth |
| AC-credit-packages-8 | SC-US-008-1 — Bounded original-source recovery; SC-US-008-2 — Erasure/payment/probe/finalization races |

## BDD scenarios
Each scenario is a prospective Given/When/Then requirement, never an executed test claim.

- **SC-US-001-1 — One trial under registration race.** Given credits_v1 enrollment and 20 same-email registrations, when all commit concurrently, then exactly one account/session creation and one 1800-unit no-expiry signup grant succeed; login, renewal and payment add no trial. A failed creation transaction leaves neither partial trial nor session.
- **SC-US-001-2 — Migration and explicit opt-in.** Given legacy accounts, active/operator rights, pending legacy invoices and an eligible free account, when schema/startup runs, then no balance or account policy changes. When the eligible account is explicitly audited and opted in under credits_v1, then one lifetime signup-or-migration grant exists; replays cannot replenish it, and protected/pending-invoice cohorts cannot opt in.
- **SC-US-002-1 — Exact catalog.** Given server-selected Start990/18000units, Pro3990/108000units and addon1490/36000units, when verified fulfillment occurs twice, then the exact immutable offer grants once; base periods last30days and the add-on has independent30day paid rights from verified purchase time, including without a base.
- **SC-US-002-2 — Paid add-on after exhaustion.** Given an expired base and a live add-on whose credits are exhausted, when paid-right readers/expiry/retention run, then paid features remain through its exclusive end boundary. Overlaps form a union; active reservations retain their pinned render decision; future credits are unavailable before their scheduled start.
- **SC-US-003-1 — Seconds precision.** Given trusted durations120,121 and120.1seconds with misleading browser estimates, when probed and retried, then stored billable units are120,121 and121 respectively, computed once; customer debit is units/60 credits with no minute rounding.
- **SC-US-003-2 — Last balance.** Given120available units and20competing120second videos, when reserving concurrently, then total reserved never exceeds120, no balance becomes negative and refused videos dispatch zero provider calls. Earliest-expiry eligible grants allocate first, no-expiry grants last.
- **SC-US-004-1 — Customer/provider split.** Given one reserved or settled input, when chunk, worker, fence, selection or render retries happen, then they reuse customer charge identity while every actual provider attempt retains its safety quota/cost. Music/CTA rerenders add zero customer credits and keep operational limits.
- **SC-US-004-2 — Race and retry after release.** Given zero usable clips, when current terminal failure races accepted first output, then video/fence serialization selects one valid settlement/release; stale callbacks cannot refund success. Given an already released charge, when explicit retry occurs, then it must reserve a new cycle before dispatch; automatic retry cannot bypass this and final net customer charge remains once.
- **SC-US-005-1 — No immediate20RUB payment.** Given Start+2addons and any immediate-upgrade request, when submitted, then no intent/provider request, money transfer, delta grant or period change occurs; UI offers full-price next-period Pro and add-on now. Unknown or missing upgrade preferences cannot enable this branch.
- **SC-US-005-2 — Future Pro.** Given a current base period and full-price Pro manual purchase, when duplicate fulfillment and two distinct purchases race, then one intent schedules once, distinct purchases serialize successive1800credit30day periods after committed base end, and current used/reserved amounts and add-on expiry remain unchanged. No card save or automatic debit occurs.
- **SC-US-006-1 — Legacy990 means legacy.** Given paid-daily, operator/pre021, pending old990invoice and in-flight legacy input cohorts, when additive migration, attempted opt-in or late payment occurs, then old rights and daily accounting persist; the invoice never becomes a Start grant based on amount. No historic debit, automatic gift or involuntary conversion occurs.
- **SC-US-007-1 — Immutable payment.** Given closed server-priced SKU/version and an idempotency key, when the client changes SKU/price/units, then validation/conflict occurs before a new financial side effect. Given forged, unavailable, wrong-amount/currency/owner or alternate-provider-payment notifications, when verified/claimed, then no unauthorized or second grant occurs; unavailable verification leaves the event retryable. Provider networking remains outside SQL.
- **SC-US-007-2 — Truthful mobile display.** Given shortage, operational-limit refusal, add-on and future Pro purchase states, when mobile offers/dashboard/return are viewed, then credits, equivalent hours, available/reserved units, exact required input and effective dates/actions appear; no midnight credit reset or immediate future-Pro promise appears. Legacy accounts retain their previous offers and checkout body.
- **SC-US-008-1 — Recovery scope.** Given mixed allocations with an expired source and zero-result failure, when released twice, then only returned expired units receive a unique24hour recovery grant; unexpired units return normally. Paid-render authorization remains restricted to original-source recovery, cannot renew unrelated storage/rights and is not obtained by revisiting a success page.
- **SC-US-008-2 — Financial erasure races.** Given account erasure racing payment, reservation/probe, finalizer and retry, when all transactions complete, then the documented lock order yields no deadlock, late unauthorized grant, orphaned hold or personal credit reference; current provider cost evidence is preserved under approved anonymization rather than erased by customer refund.

Mandatory security and rollout additions:

- **SEC-auth-bypass.** Given no valid session/Origin, when checkout, balance, retry or operator cutover is requested, then existing authorization rejects before grant, reservation or provider side effect; webhook authenticity remains a separate verified boundary.
- **SEC-input-injection.** Given SQL/XSS-like SKU/idempotency inputs and extra price/entitlement fields, when parsed, then strict closed-body validation rejects invalid values, SQL parameters remain data, and UI renders no injected markup.
- **SEC-cross-tenant.** Given account A requesting account B's intent/video/balance, when queried or retried, then own-resource404 applies and no foreign financial state is disclosed or modified.
- **SEC-rate-limit.** Given an exhausted auth/checkout limiter and a large malformed body, when submitted, then rate limiting runs before body parsing and no financial effect occurs. Existing auth defenses remain required.
- **MODE-enrollment-rollback.** Given absent, empty, unknown, legacy and credits_v1 configuration, when startup runs, then absent selects legacy and empty/unknown fails startup. Given previously persisted credit accounts/jobs/intents and later legacy mode, when they process/fulfill, then immutable credit policy remains honored while new credit enrollments/cutovers/sales are disabled.
- **CASH-refund-review.** Given a cash-refund request after credit usage, when handled, then existing OWN019 operator review applies; this release performs no automatic clawback, negative-balance adjustment or speculative refund.

## Consistency and caveats
- Authority is explicit: D00/D01/D02 direct owner answers; D03–D16 coordinator implementation choices under the supplied autonomy. Bonus nonexpiry, base30day expiry, ceil trusted seconds, original-source24hour recovery and no customer rerender charge are selected code contracts, not fabricated direct owner answers. The immediate20RUB proposal is excluded, with rejection tested instead.
- Immutable intent SKU/version/price/units and once-only fulfillment distinguish Start990 from historical Pro990. Base renewal scheduling is explicitly serialized at verified fulfillment; immutable commercial terms must preserve that scheduling rule rather than trust a stale browser date. Checkout estimates and final authoritative dates must remain distinguishable under the existing exact-date AC.
- Stable video/input charge and explicit post-release re-reservation are specified; customer refund does not remove incurred provider spend. The eight existing cost/safety ceilings remain mandatory.
- Lock order is concrete: video→credit advisory for credit jobs, payment advisory→account→intent→credit advisory for payments, account→videos→credit advisory for erasure; no credit helper takes an account row lock afterward. Barrier-based PostgreSQL tests remain necessary; prose establishes testability, not deadlock freedom.
- Add-on rights survive credit exhaustion; full paid-right reader, expiry and retention updates are explicitly required. Recovery is original-source/job scoped; an account-wide paid elevation from recovery would violate the contract.
- Full isolated-service tests with mandatory skip reporting, typecheck/lint/build, focused red/green mutations, legacy regression, browser billing/upload/dashboard/responsive checks and caller-required financial/provider contracts remain delivery gates. No code or tests were run by this requirements review.

## Blocks and concrete closure
No requirements clarification blocks the authorized offline implementation. For live payment acceptance, attach fresh provider capability evidence and an authorized source/build-bound YooKassa receipt covering exact SKU/identity/once-only fulfillment. For live processing/storage acceptance, attach authorized source/build-bound model/S3 end-to-end receipts proving accepted usable output and settlement. These closures do not authorize spend, deployment or real payment in this validation unit. Coordinator retains ownership of all pending implementation/review/delivery gates.

Status: completed
