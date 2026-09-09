# N3 referral funnel — formal Phase 4 review
Reviewer family: codex
Spec revision: sha256:e642cb5fc5b5775863ac60ed7a33c0bc3bd8e025cd91affc92ec4ab9308e3c1a

RUN_ID: 20260909T111622Z-f3-referral-3b19
WORK_UNIT_ID: referral-final-review
PROJECT_ROOT: projects/03-affiliate-rewardful
Implementation candidate: f8055e36b68f7ed880a8d5c28997801d0ca5cd26
Final observed HEAD: fae47b7d246cf2096cdc9a3d485a63546020fb39 (integration guide correction; executable candidate unchanged)
Verdict: PASS for the agreed pilot source and isolated acceptance scope. No open blocking code or documentation finding remains. Public deployment and live merchant/payment acceptance are not established by this review.

## Inputs, scope and method

Received and read the complete 01_specification.md and validation-report.md, with the canonical pseudocode/architecture/refinement/completion context. Applied .claude/skills/brutal-honesty-review/SKILL.md using the explicitly approved direct technical calibration and the feature-report-contracts.md Phase 4 format. The specification is graded as approved; later N3 email verification/OAuth and arbitrary external billing import are outside this slice.

Independent read-only review covered shared/referrals/**; payment schemas/service/provider verification; domain events/referral attribution/registry/projections; application and identity integration boundaries; public/private/account HTTP routes and frontend proxy; tracker, merchant helper, account panel/lifecycle; related tests, isolated merchant/browser harness, mutation runner, compose boundaries and feature/integration/operations documentation. Earlier bounded core findings were reopened against final bytes and final execution receipts. No project modifications, test execution, DB/browser/provider actions or subdelegation were performed by this reviewer. Existing screenshots were inspected as artifacts.

## Spec conformance

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| AC-f3-referral-funnel-11 | met | shared/referrals/service.mjs:17–72 and schema.mjs implement hash-only 90-day narrow authority, account→membership→tenant→credential locking, version/revoke/expiry rechecks and serialized rotation. tests/referral-service.test.mjs covers destinations, scope, expiry and lock-wait invalidation; tests/referral-payment.test.mjs:75 covers revocation during provider IO. Final regression passes. |
| AC-f3-referral-funnel-12 | met | shared/referrals/service.mjs:74–90 persists a random visit and frozen server expiry before configured redirect; shared/client/referral-tracker.mjs keeps first unexpired per-program cookie, uses issued expiry and removes query fields. tests/referral-client.test.mjs plus tests/e2e/referral.mjs exercise first/repeated touch, blocked storage and separate merchant navigation. |
| AC-f3-referral-funnel-13 | met | shared/referrals/service.mjs:105–148 accepts exact private input with emailVerified:true, atomically preserves tenant/customer/email/recipient identity, applies explicit promo precedence and refuses invalid explicit promo. tests/referral-service.test.mjs and referral-http.test.mjs cover stable retry, invalid/foreign evidence and forbidden browser authority fields. |
| AC-f3-referral-funnel-14 | met | helpers/service/schema preserve organic null beneficiary, reject forged/foreign receipts and exact normalized-email self-referral, and qualify registration using server expiry. tests/referral-service.test.mjs tests literal 30/60/90-day boundaries; tests/referral-payment.test.mjs:26 proves organic verified payment creates no commission. Alternate-account fraud detection is explicitly not claimed. |
| AC-f3-referral-funnel-21 | met | shared/payments/service.mjs:76–119 freezes trusted invoice amount, immutable customer binding, current policy, shop/mode and return URL before IO; scoped key/hash replay and authenticated status reject reassignment. tests/referral-payment.test.mjs:75,85 and referral-http.test.mjs cover lost responses, revoked authority, foreign orders and unverified pending state. Production guide:93–108 requires verified live payment matching the trusted invoice for fulfillment. |
| AC-f3-referral-funnel-22 | met | shared/domain/referral-attribution.mjs retains signup attribution beyond cookie expiry and applies the order snapshot; events.mjs preserves authenticated business-key dedup and cumulative refund reversal. tests/referral-payment.test.mjs:7,37,99 cover renewal/refunds, rejected provider evidence before dedup and webhook-before-create-response. Legacy event hashing remains unchanged. |
| AC-f3-referral-funnel-31 | met | shared/referrals/metrics.mjs scopes visits/customers/verified unique buyers and earliest positive commission to tenant/partner, separates test/live and UTC-week 0/1 qualification, and leaves MRR null. tests/referral-payment.test.mjs:46 covers test→live nonrecurring commission, unique buyers, historical activation after clawback and zero test payout obligation; isolated browser observes live count 0/test count 1. |
| AC-f3-referral-funnel-32 | met | shared/ui/account/referrals.mjs and app.mjs expose real owner controls/partner metrics with context-generation secret clearing; merchant-client.mjs and docs/integrations/referral-funnel.md define server authority and corrected fulfillment/error behavior. Panel/client/HTTP tests pass; isolated browser 2/2 checks A–D at 1440/390 and delayed key after logout. Reviewed mobile A/D artifacts show labeled test/live metrics and unavailable MRR. Separate runnable merchant fixture exercises its own verified signup and invoice backend. |
| AC-f3-referral-funnel-41 | met | HTTP socket-peer classes are bounded separately (public 300/min, private 600/min, 2048 buckets); SQL uses bounded shared-pool transactions and tenant-before-order ordering, with provider IO outside transactions. Referral tests cover 100000 visits/10000 customers/5000 orders; payment test:66 uses the actual application pool with ordinary identity traffic; HTTP flood test preserves the unrelated account route. Both compose files keep DB ports unpublished. Regression 118/118 and six targeted guard mutants pass/detect as appropriate. |
| AC-f3-referral-funnel-42 | met | Additive referral/checkout schemas preserve legacy source defaults and event interpretation; tests/referral-payment.test.mjs:117 reconstructs the old checkout shape, migrates and verifies old payment/refund behavior. The isolated browser uses a separate merchant frontend/backend and explicit provider stub. 05_completion.md and f2-operations.md forbid F2 backend rollback after any connector order and preserve schema/history. Reports explicitly leave public rollout and live merchant acceptance pending; missing provider configuration returns failure without synthetic success. This verdict does not certify a deployment or rollback execution. |

## Findings and closure

### CR-01 — High/P1, closed: connector test money entered cash obligations

Initial registry/projection behavior allowed test-provider commission into payable totals. Final shared/domain/registry.mjs:3–4,19 returns zero net for connector test payments and records test_payment exclusion; projections.mjs:10,21 excludes test cash/adjustments; events.mjs:46–50,90–93 retains auditable test provenance. The recommended explicit exclusion was implemented. Final tests/referral-payment.test.mjs:46 proves test-only payout is zero and test→live creates exactly the live obligation; the payout-exclusion mutant is detected. Historical F2 records intentionally retain earlier interpretation and require operator reconciliation; no retrospective guard is claimed.

### CR-02 — Medium/P2, closed: malformed order IDs reached PostgreSQL

The prior permissive 36-character guard converted malformed input into a SQL/503 error. Final shared/payments/service.mjs:109 validates UUID layout/version/variant before starting SQL. tests/referral-http.test.mjs:26 asserts HTTP 400 for 36 hyphens with valid connector authority. The recommended boundary validation is present and the final HTTP suite passes.

### FR-01 — Medium/P2, closed: production guide could grant access for test or insufficient payment

The earlier refreshFulfillment example used verified/succeeded/net-positive alone, which could grant production access from a test payment or a partially refunded invoice. docs/integrations/referral-funnel.md:93–106 now also requires testMode === false, trusted customer identity, the full invoice amount and zero refund; its conservative partial-refund policy and separate isolated-test allowance are explicit. Recommended production fulfillment guards were implemented and independently re-read in fae47b7. This documentation correction does not change executable test results.

### FR-02 — Low/P3, closed: guide advertised an unreachable public provider error code

The previous guide named PROVIDER_NOT_CONFIGURED, but apps/api/http.mjs masks internal 5xx failures as UNAVAILABLE. docs/integrations/referral-funnel.md:108 now documents the actual HTTP 503/error.code and its inability to distinguish missing configuration from provider failure, with owner payment status as configuration evidence.

### Validation correction, closed: contention test used a different pool

The earlier standalone referral fixture used its own pg.Pool, so concurrent identity traffic did not prove the production shared-pool boundary. tests/referral-payment.test.mjs:66 now concurrently calls app.referrals and app.identity on the integrated application and checks bounded completion. Its pass is in the final regression. Serial test-file execution avoids unrelated DB-wide fail-fast auth admission collisions while retaining explicit in-test races; it is not evidence of unlimited load capacity.

## Evidence inspected and limits

Evidence directory: docs/telemetry/p-replicator/20260909T111622Z-f3-referral-3b19/evidence/.

- combined-regression.tap: 118 tests, 118 pass, 0 fail/skip/cancel; 32032.411114 ms. Includes the late webhook-before-create response, literal 5000-order cap and additive old-table/legacy refund cases.
- isolated-browser.tap/json: 2/2 pass, 7972.919856 ms; separate merchant verified signup/invoice/provider-stub/refund path, A–D 1440/390 widths and delayed-secret suppression. Public-looking test origins are routed only into the isolated proxy environment. Inspected representative funnel-a-mobile.png and funnel-d-mobile.png.
- referral-mutations.json and runner source: all six targeted mutants detected, covering credential version, explicit promo precedence, server visit expiry, durable renewal attribution, provider-claim verification and test payout exclusion. This is targeted guard sensitivity, not exhaustive mutation coverage.
- The coordinator reports a 102-module build and completion/revision/scenario/traceability/canon/ownership/source gates passing. These stages were not rerun by this reviewer; inspected source-bound regression/browser/mutation receipts establish the claims above.
- No installed external merchant, live YooKassa transfer, production public smoke, arbitrary subscription import, automated payout, N3 email verification or operational SLA is established. The accepted contract trusts merchant-backend email verification and invoice authorization. One selected shop/tenant per deployment and shared proxy/NAT quotas remain explicit pilot limits.
- Rollout remains a coordinator action with separate runtime evidence. Frontend rollback may retain the F3 API; after any connector order, historical F2 backend restoration is prohibited indefinitely because late duplicate/refund delivery remains possible.

## Source identity and accounting

Read-only SHA-256 verification compared all 105 entries in evidence/candidate-source-sha256.json with current files: zero mismatches. The executable source/test snapshot is unchanged from f8055e3. Final guide SHA-256 is 2bc21c51e698638fe1c718c322c8f4c9ff0c8d1ac0fbcdb014dcbbcecea220bb. Validation report SHA-256 is 8da15ddf2ab342ef4c3dbeea7f14369387a3538ca877bdc990e74e944d88bd8b. Canonical pseudocode SHA-256 is 53e90ae6f51d79d50c88cefbe68aece9323f3935d50d9cea484784be1dc0d4e9. Future source changes require corresponding verification rather than inheriting this verdict silently.

Profile: compact-quality-first-v2, XL risk. Dispatch states inherited Astra xhigh; reviewer family is codex. Independently attributable worker model/effort metadata, usage/cost, review elapsed/active duration and weekly quota are unavailable/null here; coordinator owns host telemetry. No model fallback or subdelegation. Test durations above are measured artifact values, not reviewer wall time or cost savings.
Trace: /tmp/n3-referral-final-review.md
Status: completed
