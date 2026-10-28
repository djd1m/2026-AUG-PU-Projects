# Credit packages — Specification

Stage: Phase 1 finite code contract v2 under owner-authorized autonomy; no live activation or implementation acceptance.
Source: c559673649460fa5d8ef1e5e3c86bf7053ebbb69, 2026-10-26.
Decision authority: [owner-decisions.md](owner-decisions.md); source audit: [research.md](research.md).
D00/D01/D02 are direct owner answers. Other selected rules are COORDINATOR IMPLEMENTATION CHOICES under autonomy, not direct owner answers or production-approved commercial terms. Future immediate upgrade remains unanswered and disabled.

## Executive Summary
Add opt-in versioned credit accounting with one signup grant and purchased input-volume credits. Keep existing paid promises during transition. Reuse current YooKassa, SQL transactions, queue, attempt fences and provider spending records. Cloud.ru migration/deployment and real Metrika receipts are later work.

## Feature Matrix
| Scope | Release |
|---|---|
| Signup grant, Start, Pro, independent add-on, balance, reserves, recovery, legacy protection | First code release behind N5_BILLING_MODE=credits_v1; default legacy |
| Immediate upgrade crediting all current-period purchases | Disabled; reject before intent/provider call; future proposal only |
| Automatic card debit, nonordinary mode prices, selectable trial excerpt | Excluded; requires new scope |

## Functional Requirements
### FR-credit-packages-1
APPROVED: ordinary input costs 1 credit per60seconds, billed per second without whole-minute rounding. Catalog: Start990RUB/300credits/5h/30days; Pro3990RUB/1800credits/30h/30days; add-on1490RUB/600credits/10h/30days from purchase with paid features for its entire window. Implementation choice D04: persist ceil(trusted durationSeconds) once;1second=1/60credit with no fractional-credit truncation.

### FR-credit-packages-2
APPROVED target: new registration grants exactly30credits once; login, payments, renewals and retries do not replenish it. D05/D06 code choices: no expiry; new registrations use credit_v1 only when versioned mode enabled. Schema migration grants nothing to existing accounts. Only explicit audited operator opt-in of an eligible existing free account can issue migration_trial; lifetime uniqueness spans signup/migration sources.

### FR-credit-packages-3
Reserve the full measured input amount before any paid model call. Balance is integer seconds: 1credit=60units. Reserve identity belongs to video/input, never worker fence. Insufficient balance causes zero provider calls and an explicit shortage response. Browser duration is an estimate only.

### FR-credit-packages-4
Automatic provider retries and new fenced retries reuse the customer reservation/settlement; provider safety quotas and real attempt costs remain independently counted. Released zero-result failures require re-reservation before explicit retry; net customer processing charge remains once. D11 code choice: music/CTA rerenders cost zero extra customer credits and retain existing operational quotas.

### FR-credit-packages-5
D09 code choice: settle full input once the first usable clip is accepted; terminal zero-clip failure releases once. A stale failure cannot refund newer accepted output. D10 code choice: released amounts whose grant expired get a24h recovery grant with paid-render entitlement pinned to the original source, never a renewed full package.

### FR-credit-packages-6
Checkout accepts a closed SKU and idempotency key; server chooses price, units, window and paid rights. Persist immutable offer/version and provider identity before fulfillment. One intent can fulfill once across duplicate events or different provider payments. Historical990RUB intents preserve legacy semantics.

### FR-credit-packages-7
APPROVED: add-on paid entitlement is independent of base period. Paid rights exist while any approved entitlement window contains now; overlapping windows form a union, not added days. D07/D08 code choices: base grants expire after30days; repeat base purchases schedule successive periods; no automatic debit. Operator/pre-021 rights remain protected.

### FR-credit-packages-8
D03 release choice: immediate upgrade is disabled because its owner answer is absent. Reject any immediate-upgrade request before intent/provider creation; do not charge20RUB or issue a delta. Offer full-price Pro next committed base period and add-on now. Do not convert spent capacity, change current period end or silently credit purchases. Future20RUB+300credit proposal is retained only in owner-decisions.md, outside current implementation AC.

### FR-credit-packages-9
D06/D13 code choices: do not automatically migrate or gift any existing account; protect existing paid daily terms until old expiry and indefinite operator terms unchanged. An audited operator opt-in may convert an effective-free account only with no active legacy entitlement or unresolved legacy intent. Pin in-flight legacy jobs to legacy accounting. Do not reconstruct historical usage or convert pending legacy invoices by price.

### FR-credit-packages-10
For credit_v1 UI/catalog, show credits and ordinary-time equivalents everywhere offers appear; default-legacy accounts retain previous offers, checkout body and quotas; balance shows available/reserved units, expiry and expected input charge. Credit shortage has no midnight-reset promise. Checkout/return names exact package, effective dates and whether a renewal starts later. Persist decision/offer version. N5_BILLING_MODE accepts exactly legacy|credits_v1, defaults to legacy; empty/unknown values fail startup. It gates new credit registrations, explicit cutover and new credit catalog sales; account/input/intent policy is immutable, so disabling new enrollments never reinterprets already-created credit jobs, grants or payment fulfillment. No current production activation.

## Non-Functional Requirements
### NFR-credit-packages-1
Atomic SQL grants/reserves/settlement and DB uniqueness prevent negative balance, double allocation and duplicate fulfillment under20concurrent attempts. Use a consistent lock order and prove erasure/payment/probe races without deadlock.

### NFR-credit-packages-2
Keep authenticity before webhook claim, provider network outside SQL, own-resource404, rate limiting before request body and fail-closed paid rights. No secrets in artifacts; account erasure extends to credit references.

### NFR-credit-packages-3
Keep provider quotas, global spend caps, durable per-attempt costs and queue recovery. Customer refund never deletes incurred provider cost. No added model call, runtime service or global budget increase is authorized by this feature.

## Acceptance Criteria
### AC-credit-packages-1
US-001: as a new user I receive one trial without recurring free replenishment.
[SC-US-001-1] Given20same-email registrations, when they race, then one account and one30credit grant exist; login/payment/renewal adds no trial.
[SC-US-001-2] Given existing accounts and default legacy mode, when schema migration/startup runs, then no account policy or balance changes; explicit audited eligible-free opt-in in credits_v1 is idempotent with at most one lifetime trial across signup/migration.

### AC-credit-packages-2
US-002: as a buyer I can choose the stated packages and understand their dates.
[SC-US-002-1] Given each catalog SKU, when checkout/verified payment succeeds, then exact price, units and approved window apply once; add-on alone gives paid rights for30days.
[SC-US-002-2] Given expired base and live add-on, when a new clip renders, then paid rights remain; overlapping windows do not extend each other by summation.

### AC-credit-packages-3
US-003: as a user I pay only the measured input volume once.
[SC-US-003-1] Given120seconds input, when accepted, then reservation=120units=2credits;121seconds costs121units, never3credits.
[SC-US-003-2] Given20videos competing for the last120units, when they reserve, then total reservations≤120; refused videos dispatch no provider call.

### AC-credit-packages-4
US-004: as a user I can recover from technical errors safely.
[SC-US-004-1] Given an existing input charge, when worker/provider/fence retries occur, then customer volume is not double charged and provider attempts still count.
[SC-US-004-2] Given zero ready clips, when current terminal failure races first successful output, then exactly one valid settlement/release wins; stale failure cannot refund success.

### AC-credit-packages-5
US-005: as a Start buyer I can schedule Pro safely while immediate upgrade remains unavailable.
[SC-US-005-1] Given Start+2addons and a request for immediate20RUBupgrade, when submitted, then it is refused before payment intent/provider call, no money or credits change, and next-period Pro/addon-now actions are shown.
[SC-US-005-2] Given an active base period and manual full-price Pro renewal, when duplicate/concurrent verified fulfillment occurs, then one future1800credit period is scheduled after committed base end, existing grants/expiry/used/reserved volume unchanged; no auto-debit.

### AC-credit-packages-6
US-006: as an existing customer I retain purchased conditions.
[SC-US-006-1] Given legacy paid/operator accounts and pending old990invoice, when cutover/payment occurs, then original daily/indefinite terms survive and no retroactive credit debit appears.

### AC-credit-packages-7
US-007: as a buyer I can trust balance and payment confirmation.
[SC-US-007-1] Given different SKU with the same idempotency key, forged/unavailable webhook or different provider payment for one fulfilled intent, when processed, then conflict/retry/review applies and no double grant occurs.
[SC-US-007-2] Given a credit shortage or future renewal, when viewed on mobile, then available/reserved credits, hours, dates and correct action appear without false midnight reset or immediate-Pro claim.

### AC-credit-packages-8
US-008: as a user I recover credits after a service failure near expiry.
[SC-US-008-1] Given an expired source grant and zero-result technical failure, when the code recovery contract applies, then only released units receive24h, original paid-render rights stay pinned and duplicate recovery is impossible.
[SC-US-008-2] Given erasure/payment/probe/finalization races, when completed, then no deadlock, orphaned hold, unauthorized grant or leaked personal credit reference remains.

## Success Metrics
| Metric | Target | Source |
|---|---|---|
| Duplicate fulfillment/negative balance under mandatory races | 0 | наша БД |
| Once-only trial grant per account | ≤1 | наша БД |
| Missing customer-charge/provider-attempt distinction in receipts | 0 | наш журнал |
These are acceptance targets, not observed results or commercial conversion forecasts.
