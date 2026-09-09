# Requirements Testability Analysis
Spec revision: sha256:e642cb5fc5b5775863ac60ed7a33c0bc3bd8e025cd91affc92ec4ab9308e3c1a

## Summary

- Verdict: NEEDS WORK — one concrete rollback safety gap; the acquisition/payment contract is otherwise implementable with the caveats below.
- Stories analyzed: 1; acceptance criteria analyzed: 10.
- Average score: 96/100 including specific security and growth-trace bonuses (base86 +5 +5).
- Blocked by score <50 or the three artifact floors: 0. The rollback blocker is an independent money-safety finding, not a fabricated low testability score.
- RUN_ID: 20260909T111622Z-f3-referral-3b19; WORK_UNIT_ID: funnel-validation.
- Project root: projects/03-affiliate-rewardful. All source references below are relative to that root. Read-only review; no project modifications, test execution, runtime calls or subdelegation.

## Results

| Story | Title | Score | INVEST | SMART | Status |
|-------|-------|-------|--------|-------|--------|
| US-001 | Connect actual merchant signup and billing to an affiliate result | 96/100 | 4/6 complete, E/S partial; 42/50 | 3/5 complete, S/M partial; 24/30 | NEEDS WORK — B1 |

The independent merchant integration seam is a justified bounded product slice. Explicit decisions are accepted: visit→verified-signup qualification, permanent customer attribution, current policy frozen into each new order, authenticated merchant invoice amount, exact-email self-referral coverage, subsequent N3 email verification, and one configured shop. None is reopened by this review.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-f3-referral-funnel-11 | S11 — Merchant key lifecycle retains tenant authority through rotation, expiry and waits |
| AC-f3-referral-funnel-12 | S12 — Referral redirect preserves first touch and the visit's frozen expiry |
| AC-f3-referral-funnel-13 | S13 — Verified merchant signup binds once with explicit promo precedence |
| AC-f3-referral-funnel-14 | S14 — Invalid evidence refuses while expired or absent evidence permits an organic purchase |
| AC-f3-referral-funnel-21 | S21 — Authenticated invoice creates one immutable order and verified fulfillment status |
| AC-f3-referral-funnel-22 | S22 — Bound customer earns policy-governed repeat commissions with immutable refund corrections |
| AC-f3-referral-funnel-31 | S31 — Isolated funnel metrics distinguish test history and first live commission |
| AC-f3-referral-funnel-32 | S32 — Owner and partner complete the actual merchant integration journey without stale secrets |
| AC-f3-referral-funnel-41 | S41 — Contending referral and payment operations preserve bounded resources and lock order |
| AC-f3-referral-funnel-42 | S42 — Migration and rollback cannot reinterpret any connector notification as a legacy payment |

## Acceptance evidence and scoring

The following are exact excerpts from `01_specification.md`, under each matching AC heading; they establish nonzero Testable and Completeness. This report's `## Criterion scenarios` supplies the Traceability artifact for all ten ACs.

| AC suffix | Quoted acceptance evidence |
|-----------|----------------------------|
| 11 | “account version, expiry and revocation are checked on every use and after waits.” |
| 12 | “persist a random opaque visit before redirecting only to the configured HTTPS landing” |
| 13 | “explicit valid promo wins, explicit invalid promo refuses without cookie fallback, and repeat binding cannot change email or recipient.” |
| 14 | “expired receipt yields an explained organic binding, and absent evidence yields an organic binding with null beneficiary.” |
| 21 | “Same request/key reuses the order, changed input conflicts.” |
| 22 | “Invalid provider evidence does not consume dedup identity; late create response cannot downgrade verified success.” |
| 31 | “Test-provider amounts and activation are labeled test and excluded from live first-commission qualification.” |
| 32 | “browser never receives connector secret.” |
| 41 | “there is no network/KDF while holding SQL, bounded admission and DB timeouts apply” |
| 42 | “legacy orders retain their historical attribution behavior while new connector orders use explicit snapshots” |

INVEST: Independent8, Negotiable8, Valuable10, Estimable4 (the unresolved seams below affect exact implementation), Small4 (one story covers multiple bounded implementation units), Testable8 =42/50. SMART: Specific4 (“bounded admission” lacks literal rates), Measurable4 (missing rate/cap-recovery controls), Achievable6, Relevant5, Time-bound5 =24/30. Quality: Traceability10 + Completeness10 (happy paths, errors and concurrency/expiry edges exist) =20/20. Security +5: exact scoped authorization, hashed credentials, server/provider authority and tenant denial are specified. Growth +5: `docs/product-discovery-brief.md` Growth Requirements Seed has FR-GROWTH-001…006, each exact ID is retained in `docs/Specification.md` under `Сохранённые требования discovery`; this proves carry-forward only, not delivery or a new approval of speculative growth work.

## Blocking finding

### B1 — Rollback plan cannot safely resume the F2 webhook processor after connector traffic

Evidence: `05_completion.md`, Deployment Plan, says to quiesce connector/webhook ingress and reconcile outstanding orders before restoring the legacy payment processor. F2 `shared/payments/service.mjs:77–87` selects any saved order for its configured shop and constructs legacy cookie attribution from `order.input`/creation time; it has no connector-source refusal. Therefore reconciling outstanding orders is insufficient: a later refund or duplicate notification for an already completed connector order still reaches the old interpretation after ingress resumes. Organic orders may fail legacy beneficiary validation; bound orders may receive a conflicting event shape or incorrect legacy eligibility. The existing instruction to test an “operational boundary” does not identify a boundary that survives resuming legacy webhooks.

Required change: document one executable supported rollback: retain a compatible F3 webhook processor/source-dispatch guard while rolling back UI/other components; or explicitly prohibit resuming the legacy payment webhook after any connector order exists and keep payment ingress quiesced until a compatible processor returns. Pre-connector-traffic rollback may still restore the unchanged F2 API. Reconciliation alone must not be presented as the condition that makes F2 safe again.

Required scenario S42: create both bound and organic connector payments; mark them reconciled; perform the supported rollback; deliver delayed duplicate and refund notifications. They must either follow connector semantics through the compatible processor or be withheld by the documented enforced boundary, with no legacy processing, no false ACK of an unapplied refund, and recoverable delivery when compatible service resumes. Also prove a migrated legacy-only database remains readable by the old image.

## Caveats to close in the implementation contract

### C1 — Tracker interface omits the issued visit's frozen expiry

`02_pseudocode.md:26` requires first unexpired touch with a frozen receipt window, but `:83` returns only `{tenantId,windowDays,landingOrigin}` from `trackerConfig`. That current policy window does not convey the original receipt's expiry. If a copied referral URL is opened later or the policy changes between issue and capture, client-generated expiry may outlive the valid receipt and cause a later eligible referral to be discarded. Server binding remains financially safe, but the genuine later referral is lost.

Resolve the transport explicitly: convey the visit's server-issued expiry in a non-authoritative companion field or expose a bounded receipt-inspection/capture result; server receipt validation remains authoritative. Define registration qualification time as server binding time if that is intended, since the API accepts no merchant signup timestamp. S12/S14 must cover a policy-window change and an expired cookie receipt followed by a fresh referral, not only forged browser time.

### C2 — Test/live isolation must include non-recurring eligibility, not just metrics

`01_specification.md` AC22 governs recurring rewards and AC31 separates test/live activation. Existing `shared/domain/events.mjs:33` consumes non-recurring eligibility using any prior rewarded payment for the same customer/beneficiary, without provider test/live mode. Unless the new trusted path deliberately separates that history, a test payment can suppress the first live commission when recurring=false. Carry provider mode into the evidence used by this decision, or explicitly prohibit the relevant test→live reuse and test that refusal. S22/S31 must exercise a test payment followed by a live payment for the same binding, then a second live payment; test amounts must neither consume the first live allowance nor qualify live activation.

### C3 — Make credential/tenant lock order and public admission measurable

`02_pseudocode.md:16,48,70,83` specifies tenant-before-order, but rotation updates old credential rows after tenant locking while connector authorization may lock those same credential/account rows before waiting on tenant. The internal `authorize` contract must name whether it holds row locks and the order shared by rotate/revoke/bind/checkout/final response. A final `fresh` time check alone does not recheck revocation/version unless a protecting lock is held or authority is re-read. These are implementation obligations, not a finding that nonexistent new code already deadlocks.

Specify literal public/integration request rates, bounded limiter state, and a cap/retention rule for repeated credential rotations; the three existing caps omit credential-history growth. S41 must race rotate/revoke with an authorized request waiting for tenant access and a provider response, then verify no stale secret/data result and no lock cycle, while an unrelated tenant completes within the configured timeout budget. An unauthenticated referral flood must hit the specified admission limit before exhausting durable visit capacity.

## Named BDD scenarios

- S11: Given a real merchant and an active90day key, when another key is rotated or the owner's account version changes during a delayed connector call, then new requests and post-wait publication recheck authority and reject the stale key; expiry exactly at the boundary fails.
- S12: Given a configured HTTPS merchant origin and enrolled cash partner, when a browser follows `/r/:actorId`, then a durable visit precedes302; the tracker retains the first eligible touch, strips query data, and never extends its issued lifetime. Policy changes/late captures follow C1.
- S13: Given a backend-attested verified email and stable external customer ID, when parallel matching binds arrive with valid promo plus a conflicting visit, then one binding names the promo recipient; an invalid promo commits no mapping and a corrected retry succeeds. Repeat calls cannot rewrite email/recipient.
- S14: Given absent or expired evidence, when the merchant binds then charges an organic customer, then beneficiary remains null and commission zero. Given a forged/cross-tenant receipt or the exact partner/owner email under a different external ID, then the operation refuses explicitly. Exercise30/60/90day signup boundaries and permanently bound late payments.
- S21: Given an authenticated invoice sourced from the merchant's own catalog, when duplicate checkout requests use the same key, then one saved order freezes amount/binding/policy/shop/mode/return URL; changed input conflicts. A confirmation redirect/create response cannot make order status verified-success.
- S22: Given a bound customer and frozen order policy, when later payments arrive after cookie expiry and promo changes, then recipient stays fixed; current per-order recurring/rate/hold rules apply. Duplicate/partial/reordered refunds append one correct adjustment; a provider failure leaves a complete safe retry; late create response preserves succeeded.
- S31: Given fixture, legacy, test and live payment histories across two tenants and two partners, when metrics are read across a UTC week boundary, then only authorized connector facts count, test amounts are separate, and the earliest positive live commission creates one tenant-week qualification that later refunds do not erase. Test-to-live eligibility follows C2.
- S32: Given a separate merchant frontend/backend and the real account screens at390/1440, when a user signs up, checks out and views progress, then the server helper uses verified signup and authoritative invoice data, fulfillment reads verified status, and keyboard controls work. Logout/member switch before key/status responses prevents secret or foreign-state rendering. Provider-not-configured remains explicit503.
- S41: Given concurrent click/bind/order/webhook/rotation operations and injected provider delays, when configured request/cap/time limits are reached, then admission denies predictably, no provider/KDF holds SQL, one binding/order/reward survives and an unrelated tenant remains usable. Include C3's auth-row contention and post-wait expiry.
- S42: Given additive migration and connector traffic, when the supported rollback occurs and a delayed connector refund/duplicate arrives, then the enforced boundary prevents all legacy reinterpretation and permits later safe recovery; legacy-only rollback still works. Stub evidence remains labeled and live acceptance remains unperformed without credentials.

## Mandatory security BDD scenarios

- SEC-AUTH: Given no/forged/revoked bearer, an account session presented as a connector key, or an Origin-bearing browser request, when a private endpoint is called, then it denies before customer/order reads or mutation. Public locator/tenant ID never supplies authority.
- SEC-INJECTION: Given SQL metacharacters in customerId, prototype keys, malformed token/promo, and an HTML/script payload in a rendered field, when the appropriate boundary is exercised, then schema validation/parameterized queries/render escaping prevent execution and no extra authority field is accepted. No requirement to run an unrelated broad scanner is invented.
- SEC-TENANT: Given tenant A's key plus tenant B's visit/order identifier, when bind/order status is requested, then no B data or commission escapes, including a retry with a previously cached idempotent result.
- SEC-RATE: Given repeated invalid public referral and connector-auth attempts, when the specified threshold is crossed, then429 occurs with bounded limiter storage and no unchecked DB/provider work; valid unrelated traffic remains within the chosen budget. Thresholds are the concrete C3 clarification.

## Revision and validation limits

Inspected all five feature documents and the named skill/report/scoring contracts. Specification hash was unchanged on the second read. Other input SHA256 values: pseudocode472f2f9533456c5cf0f90b12edd5c4490a6432f7a1723e8ca38bc8a4857c6d67; architecture91fc3a5a3ea1fbe13a4b1b5d66ff4e800fdbb023333baea8245f5bbee3e672f9; refinement8f612ce947595d2610bf1eaeeece7a2ac69b411b657aabd975ef6750359a393a; completiona514a195d7bd8d2973f20d459832aa7bda38d2118cd8a3b62dc28341133a896c.

No automated gate, test, browser, provider or deployment command was executed; named scenarios are generated requirements evidence, not passing tests. Provider protocol research was not repeated because this work validates reused local integration contracts. Requested/actual model, effort, usage, cost, elapsed/active and weekly quota remain null in this worker receipt without independently supplied host metadata; coordinator owns measured dispatch evidence. Profile: compact-quality-first-v2; no fallback/subdelegation; economic savings not established.

Trace: /tmp/n3-funnel-validation.md
Status: completed
