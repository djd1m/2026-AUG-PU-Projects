# Credit packages — Specification

Stage: Phase 1 PLAN, pending owner plan approval; no implementation acceptance.
Source: c559673649460fa5d8ef1e5e3c86bf7053ebbb69, 2026-10-26.
Decision authority: [owner-decisions.md](owner-decisions.md); source audit: [research.md](research.md).
Any monetary rule marked PENDING is a proposal, never an approved fallback.

## Executive Summary
Replace renewing daily free processing with one signup grant and purchased input-volume credits. Keep existing paid promises during transition. Reuse current YooKassa, SQL transactions, queue, attempt fences and provider spending records. Cloud.ru migration/deployment and real Metrika receipts are later work.

## Feature Matrix
| Scope | Release |
|---|---|
| Signup grant, Start, Pro, independent add-on, balance, reserves, failure recovery, legacy protection | MVP after owner approval |
| Immediate upgrade crediting all current-period purchases | Pending owner choice D03; full candidate contract below |
| Automatic card debit, nonordinary mode prices, selectable trial excerpt | Excluded; requires new scope |

## Functional Requirements
### FR-credit-packages-1
APPROVED: ordinary input costs 1 credit per60seconds, billed per second without whole-minute rounding. Catalog: Start990RUB/300credits/5h/30days; Pro3990RUB/1800credits/30h/30days; add-on1490RUB/600credits/10h/30days from purchase with paid features for its entire window. Persist trusted billable seconds once; subsecond precision proposal D04 remains pending.

### FR-credit-packages-2
APPROVED: new registration grants exactly30credits once; login, payments, renewals and retries do not replenish it. PENDING D05/D06: no expiry; migrated free accounts receive one transitional grant, with lifetime uniqueness across signup/migration grants.

### FR-credit-packages-3
Reserve the full measured input amount before any paid model call. Balance is integer seconds: 1credit=60units. Reserve identity belongs to video/input, never worker fence. Insufficient balance causes zero provider calls and an explicit shortage response. Browser duration is an estimate only.

### FR-credit-packages-4
Automatic provider retries and new fenced retries reuse the customer reservation/settlement; provider safety quotas and real attempt costs remain independently counted. Released zero-result failures require re-reservation before explicit retry; net customer processing charge remains once. Rerender price is PENDING D11.

### FR-credit-packages-5
PENDING D09: settle full input once the first usable clip is accepted; terminal zero-clip failure releases once. A stale failure cannot refund newer accepted output. PENDING D10: released amounts whose grant expired get a24h recovery grant with paid-render entitlement pinned to the original source, never a renewed full package.

### FR-credit-packages-6
Checkout accepts a closed SKU and idempotency key; server chooses price, units, window and paid rights. Persist immutable offer/version and provider identity before fulfillment. One intent can fulfill once across duplicate events or different provider payments. Historical990RUB intents preserve legacy semantics.

### FR-credit-packages-7
APPROVED: add-on paid entitlement is independent of base period. Paid rights exist while any approved entitlement window contains now; overlapping windows form a union, not added days. PENDING D07/D08: base grants expire after30days; repeat base purchases schedule successive periods; no automatic debit. Operator/pre-021 rights remain protected.

### FR-credit-packages-8
PENDING D03/D12: offer immediate Start→Pro upgrade crediting ALL eligible base/add-on purchases in the current base period. New money=max(0,3990−eligibleRUB); added capacity=1800−eligibleCredits. Preserve spent/reserved volume, existing addon expiry, base end and paid rights; unique upgrade fulfillment. If either eligible money or capacity exceeds Pro target, offer next-period Pro; no destructive conversion or automatic cash refund. Start+2addons=3970RUB/1500credits gives20RUB+300credits, never1800new credits.

### FR-credit-packages-9
PENDING D06/D13: migrate existing free accounts once; protect existing paid daily terms until old expiry and indefinite operator terms until explicit opt-in. Pin in-flight legacy jobs to legacy accounting. Do not reconstruct historical usage or convert pending legacy invoices by price.

### FR-credit-packages-10
Show credits and ordinary-time equivalents everywhere offers appear; balance shows available/reserved units, expiry and expected input charge. Credit shortage has no midnight-reset promise. Checkout/return names exact package, effective dates and whether a renewal starts later. Financial changes require approved decision version.

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
[SC-US-001-2] Given a cutover free account, when approved migration is replayed, then at most one lifetime trial exists across signup/migration sources.

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
US-005: as a Start buyer I can use the approved upgrade mode.
[SC-US-005-1] Given Start+2addons purchased in the same base period and100credits already spent, when proposed immediate upgrade is selected and verified, then payment20RUB adds300credits, aggregate remaining1700credits before reservations, base end unchanged, addon expiry preserved.
[SC-US-005-2] Given duplicate or concurrent upgrade attempts, when verified, then at most one delta grant and one monetary credit apply; excess-paid/capacity cohorts receive a next-period offer.

### AC-credit-packages-6
US-006: as an existing customer I retain purchased conditions.
[SC-US-006-1] Given legacy paid/operator accounts and pending old990invoice, when cutover/payment occurs, then original daily/indefinite terms survive and no retroactive credit debit appears.

### AC-credit-packages-7
US-007: as a buyer I can trust balance and payment confirmation.
[SC-US-007-1] Given different SKU with the same idempotency key, forged/unavailable webhook or different provider payment for one fulfilled intent, when processed, then conflict/retry/review applies and no double grant occurs.
[SC-US-007-2] Given a credit shortage or future renewal, when viewed on mobile, then available/reserved credits, hours, dates and correct action appear without false midnight reset or immediate-Pro claim.

### AC-credit-packages-8
US-008: as a user I recover credits after a service failure near expiry.
[SC-US-008-1] Given an expired source grant and zero-result technical failure, when approved recovery applies, then only released units receive24h, original paid-render rights stay pinned and duplicate recovery is impossible.
[SC-US-008-2] Given erasure/payment/probe/finalization races, when completed, then no deadlock, orphaned hold, unauthorized grant or leaked personal credit reference remains.

## Success Metrics
| Metric | Target | Source |
|---|---|---|
| Duplicate fulfillment/negative balance under mandatory races | 0 | наша БД |
| Once-only trial grant per account | ≤1 | наша БД |
| Missing customer-charge/provider-attempt distinction in receipts | 0 | наш журнал |
These are acceptance targets, not observed results or commercial conversion forecasts.
