# Credit packages — corrective cold source review
Reviewer family: codex
Spec revision: sha256:c6b755b35196bd28e58ac54312e7d1f91e865e8306b9a2aca169d0cabf615608

Frozen candidate: 5b306f1646efb75494b67da1e0f234c3c94e2790.
Prior reviewed candidate: 13680516ffdd63167b019afeff9ab7bed94123c2; intermediate: 86a6dded.
Repository: /tmp/n5-acquisition-analytics-20261026; project: projects/05-podcast-clips-opus.
Scope: immutable corrective diff only, plus original planner context and prior independent review. No coder conversations, external receipt files or test logs were consumed. The completion document's coverage/source text was inspected as a diff, without following its execution-receipt links or accepting its outcomes.
Requested model/effort: gpt-6.1-sol/high. Actual host-verified model, effort, token usage and cost: null (metadata unavailable).
Method: technical/direct source review under brutal-honesty-review and feature-report-contracts. No source, runtime, provider or agent actions; only this requested /tmp report is written.

## Verdict
P2-1 is CLOSED in source. No new defect was found in the bounded corrective diff. READY for root-owned mandatory verification and final acceptance review. This is a source pre-review closure, not a test pass, final feature acceptance, deployment approval or live bank/model/S3 compatibility claim.

The specification bytes remain unchanged and match the digest above. Seven unaffected AC source judgments carry forward from /tmp/n5-credit-review-13680516-20261026.md; AC7/payment identity/date disclosure were re-evaluated against the exact new candidate.

## Correction assessment
**Effective dates before payment:** packages/db/src/credits.ts now factors the existing scheduling query into nextCreditBaseStart. Both serialized fulfillment and readCreditPurchaseWindows use that same query: maximum of current verified-payment/preview time, all committed base entitlement ends and protected legacy payment end. `base_sku IS NOT NULL` excludes add-on windows. The new reader restricts itself to an active credit account and returns separate base/add-on start/end values and a scheduled flag.

apps/web/src/app/upgrade/page.tsx calls that server reader for the authenticated credit account and passes its result to UpgradeScreen. The credit catalog renders each base/add-on prospective date range before its purchase button, states when the base starts later, and explicitly explains that another committed purchase or payment timing can alter the final dates. Missing window data disables the purchase buttons and asks the buyer to refresh. The existing immutable-intent fulfillment and authoritative return dates are preserved. No date, price, grant or entitlement supplied by the browser is trusted for fulfillment; the POST body remains closed SKU/idempotency only. No proration/quote engine or immediate-upgrade branch was added.

The added source test builds Start+Pro+Pro on real PostgreSQL fixtures, expects the next base window1April–1May2030, renders those server-derived dates, separately excludes an add-on-only window from base scheduling and tests a protected legacy end. Assertions are meaningful source coverage; their execution is not established by this review. The mutation source adds date-disclosure and add-on-exclusion targets.

**Provider-payment identity:** packages/db/src/payments.ts adds an early return for an existing succeeded provider-payment record while already holding the provider/payment advisory lock. The prior refunded guard remains first. A successful financial fact therefore cannot be rebound to another intent/account even with a distinct event key. Immutable SKU/amount/provider-ID intent checks and intent-level once-only fulfillment remain unchanged. The new independent negative test uses two accounts and two intents, reuses the first payment ID for the second and checks zero second-account grants plus a still-created second intent. A corresponding mutation target is present. This narrows financial authorization; it introduces no second fulfillment path.

**Coverage document:** 05_completion.md now has exactly eight Criterion coverage rows pointing at actual candidate test titles in tests/credit-packages.integration.test.ts. Its wording distinguishes that index from actual full-suite/browser/live-provider acceptance. Native coverage validation and execution receipts remain root-owned; no structural-gate pass is asserted here.

## Spec conformance
`met` below means source conformance in this cold pre-review. It does not mean mandatory concurrency, mutation, browser or full-suite checks have executed successfully.

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| AC-credit-packages-1 | met | Prior reviewed PgAuthStore account/trial/session transaction, credits.ts grantTrialTx/optInCredits and migration022 lifetime-trial/default-legacy protections remain unchanged. Added failed-signup source test explicitly checks account/trial/session rollback on session conflict. |
| AC-credit-packages-2 | met | Exact SKU catalog, independent add-on entitlement union and credit exhaustion behavior are unchanged. The extracted nextCreditBaseStart preserves the original base scheduling query and excludes add-ons via base_sku IS NOT NULL; new server date reader does not alter grants or paid rights. |
| AC-credit-packages-3 | met | Trusted ceil-second persistence, stable video reservation, guarded balance allocation, insufficient-balance rejection and provider dispatch ordering are unchanged from the prior review. Shared tariff adds only the purchase-window interface. |
| AC-credit-packages-4 | met | Stable input/charge reuse across provider/fence retries, explicit post-release re-reservation, first usable clip settlement and stale failure protections are untouched; no corrective diff changes provider budgets or terminal paths. |
| AC-credit-packages-5 | met | Immediate upgrade remains rejected before intent/provider creation, with no20RUBdelta or proration path. Serialized full-price future base fulfillment now calls the extracted identical scheduling query. Prospective UI dates do not mutate existing periods, used/reserved volume or add-on expiry. |
| AC-credit-packages-6 | met | Additive default-legacy migration, historical990intent semantics, protected legacy/operator cohorts, audited eligible-free opt-in and pinned in-flight policy are untouched. nextCreditBaseStart retains the protected plan_paid_until branch; added source test checks that date wins over the preview clock. |
| AC-credit-packages-7 | met | P2-1 closed by credits.ts readCreditPurchaseWindows/shared scheduler, authenticated upgrade/page.tsx wiring and UpgradeScreen prospective date ranges/later-start disclosure/missing-data disable. New multi-period test covers actual server-derived dates. payments.ts additionally rejects any already-succeeded provider payment before a second intent/account grant; the independent cross-account negative test and mutation target are present. Original exact final return metadata, strict bodies and webhook verification ordering remain intact. |
| AC-credit-packages-8 | met | Allocation-sized24hour original-video recovery, source entitlement scope, account-before-video credit locks and erasure/finalization cleanup are unchanged from the prior review. Neither date preview nor provider-duplicate rejection acquires a new reversed lock or modifies recovery/retention state. |

## Remaining acceptance boundary
Root retains responsibility for the final immutable source/build binding, real isolated-service full suite and mandatory skip reporting, native coverage gate, targeted mutation receipts, browser/responsive acceptance and any required erasure/payment/probe/finalization race evidence. Existing source tests and coverage rows are not execution evidence. No bank/model/S3 credentials or live provider proofs were requested or used; those separate live acceptance gates are neither closed nor waived.

No corrective code action is requested by this review. Do not add optional polish or broaden commercial scope to close this pass.

Status: completed
