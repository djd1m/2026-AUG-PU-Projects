# N3 referral core implementation review
Reviewer family: codex
Spec revision: sha256:e642cb5fc5b5775863ac60ed7a33c0bc3bd8e025cd91affc92ec4ab9308e3c1a

RUN_ID: 20260909T111622Z-f3-referral-3b19
WORK_UNIT_ID: referral-code-review
PROJECT_ROOT: projects/03-affiliate-rewardful
Canon pseudocode SHA256: 53e90ae6f51d79d50c88cefbe68aece9323f3935d50d9cea484784be1dc0d4e9
Initial observed HEAD: 1c929709040c04c5bcc667199b0beaf509548f95; final observed HEAD: 9bd15d3221501e403a564b7c2be6d7930998acd2. Coordinator integration work occurred during review; per-file hashes below identify reviewed bytes.
Verdict: PASS for this bounded source review — no unresolved findings remain. Both the test-money safety defect and malformed-order boundary defect were independently re-read after coordinator fixes. Build/test/release acceptance remains with the coordinator.

## Scope and method

Read only shared/referrals/**, shared/domain/events.mjs and referral-attribution.mjs, shared/payments/service.mjs and schema, and focused referral test sources. Coordinator expressly expanded review to the small current registry.mjs/projections.mjs diff and payout/shared-pool test changes to close the money finding. No source modifications, test execution, DB/browser/provider actions, or subdelegation. UI completion or missing final E2E is not treated as a code finding.

## Boundary finding resolved before terminal receipt

### CR-02 — P2, CLOSED at source level: malformed order UUIDs previously reached PostgreSQL

File: shared/payments/service.mjs:109–112.

The initially inspected connectorOrder accepted any36character string consisting of hexadecimal digits and hyphens, so36hyphens reached the PostgreSQL UUID cast and became DATABASE_UNAVAILABLE/503 instead of malformed-input400. Recommended fix was strict UUID validation before SQL plus a malformed-input assertion.

The coordinator applied the exact UUID layout/version/variant pattern before starting the transaction. The reviewer independently re-read that source and tests/referral-http.test.mjs:26, which asserts400 for36hyphens with a valid integration bearer. Current payment service SHA is82f191287f1b5d0b5a80e2cd6a8c01176015f27999a7af4245e4ddec754eebde. This closes the source defect; the HTTP test was inspected, not executed by the reviewer.

## Discovered finding resolved during this review

### CR-01 — P1, CLOSED at source level: provider test commissions could become cash payout obligations

Initial inspected code persisted connector testMode on payment records but inserted ordinary cash ledger entries, and existing registry/cash calculations did not exclude these test payments. A test payment followed by a live payment could therefore produce two payable commissions even though only one represented money.

The coordinator fixed this in its owned source scope, and the reviewer independently read the current diff:
- shared/domain/events.mjs:46–50,90–93 preserves testMode on connector positive and refund ledger entries.
- shared/domain/registry.mjs:3–4 returns paymentNet0 for connector test payments; :19 excludes them explicitly as test_payment before period/hold/eligibility handling.
- shared/domain/projections.mjs:10 excludes connector test payments from cash accrual/availability; :21 excludes test adjustments; :28–30 carries mode to the partner payment view.
- tests/referral-payment.test.mjs:37–54 now asserts test-only cash accrued0, registry amount0 with test_payment exclusion, then test/live unique customers and exactly20000 live accrued commission after the mode transition. These assertions were inspected, not run by this reviewer.

The guards preserve auditable test history while preventing new connector test amounts from entering payout obligations. Existing historical F2 test facts intentionally retain their earlier interpretation: the legacy format did not persist this connector provenance. This receipt does not falsely claim that old F2 facts were retrospectively classified or isolated.

## Validation improvement resolved during review

The initial resource-pressure test used a separate default pg.Pool for referrals in tests/helpers/referral-fixture.mjs:11, while its concurrent identity call used the application pool. That did not test the production shared-pool boundary. The new tests/referral-payment.test.mjs:57–64 calls app.referrals and app.identity together through the integrated application, checks one binding and a bounded5000ms completion. This corrects the scope of the test; it is not a measured pass in this receipt.

## Checked invariants with no additional finding

- Tenant authority and key lifecycle: referrals/service.mjs:17–31 reads candidate without key lock, locks account→membership→tenant→credential, then rechecks key/version/revoke/expiry. Rotation/revocation :56–72 serialize on the same tenant and retain at most one row via schema uniqueness. Provider calls do not hold those locks.
- Immutable customer attribution: referrals/service.mjs:105–148 validates exact input, preserves existing email/recipient mapping, gives explicit promo precedence, rejects unknown/foreign evidence, stores expired/organic null beneficiary, and compares normalized merchant-attested email with owner/recipient identities. Exact-email coverage is not presented as alternate-account fraud prevention.
- Visit qualification: referrals/service.mjs:74–90 snapshots server visit/expiry and includes issued expiry in the redirect. Binding uses that receipt and current eligibility; later orders use the immutable customer row. Fixed config destinations never come from a request redirect parameter.
- Durable order authority: payments/service.mjs:76–106 derives beneficiary from binding, snapshots amount/policy/return URL/mode before IO, namespaces connector idempotency keys and checks body hash on repeats. CompleteOrder :59–74 preserves verified succeeded state after late provider create response and reauthorizes after IO.
- Verified event and legacy replay: payments/service.mjs:122–150 verifies remotely before SQL, locks tenant then order, validates provider/order/shop/mode/amount, and commits ledger/status together. events.mjs:57–65 keeps legacy event-only hashing while connector events hash the frozen binding too. New additive source defaults preserve historical legacy interpretation.
- Recurring and refunds: referral-attribution.mjs:25–29 separates connector test/live prior rewards; it does not expire/re-resolve the saved referral at renewal. events.mjs retains cumulative minor-unit reversal and event deduplication, including pending refunds; organic connector payments produce no positive obligation.
- Metrics and privacy: referrals/metrics.mjs:5–29 scopes SQL by tenant/optional partner, matches succeeded connector orders to stored payment/binding/mode evidence, distinguishes unique test/live buyers, and retains historical first live positive commission after refunds.

## Source identity

All hashes identify actually inspected bytes, including dirty/untracked files; this is not a clean-HEAD-only review. Later coordinator edits require their own validation.

| File relative to PROJECT_ROOT | SHA256 |
|--------------------------------|--------|
| shared/referrals/service.mjs | 97388d824f8628c45421bff15ae8b4952fa4a836d6bad82f07992b75bbd5b7d4 |
| shared/referrals/helpers.mjs | 1bcd0e221824581ef2b977ccc77dd4a285a840ca6d2fcb035d27027afcca0d35 |
| shared/referrals/metrics.mjs | 9b6113efa81b38c20f56868e6ed6708078de1067dc5412c6ff5e2b39c868e0d4 |
| shared/referrals/schema.mjs | e446cb3436fab07f54404524f55614166f9763a8c1675f96424b3e184fcd578e |
| shared/domain/events.mjs | 6b5bbe807d52974e594c950f044949d5ceb99551c79c1f1d14ea1fc4438d004e |
| shared/domain/referral-attribution.mjs | b074c17425b1d634940e7a203361e906f8efa524814b818bf017e2a6a27f732f |
| shared/domain/registry.mjs | 5c48ff845c6c1931a54f7a904d14a77b557d5b4b851198d1e9b0d502d47b5449 |
| shared/domain/projections.mjs | e24f9ac11dc6ae22d27638755c99e544810885ede5a44e5d5c33cde5615d9087 |
| shared/payments/service.mjs | 82f191287f1b5d0b5a80e2cd6a8c01176015f27999a7af4245e4ddec754eebde |
| shared/payments/schema.mjs | d683e660c7f63b6a8d69255eb440695765ae215162bb07659c2ac05988bfc3f4 |
| tests/referral-payment.test.mjs | 32b3c969cd9b71c947440ae86a9d7fdca2229149fd86bdb877a342cf4bf81f3e |
| tests/referral-service.test.mjs | b7536d15ecef151519aa9d7f5844daa879d80cddafa66b0a3e6cdcd149a895e4 |
| tests/referral-http.test.mjs (targeted malformed-ID assertion only) | 6f542fe73b79cd5848edf5539e617f418784853ac304a5efd8e737d1bf3d1811 |

Profile: compact-quality-first-v2; dispatch states inherited Astra xhigh. Independently attributable worker model/effort metadata, usage/cost, elapsed/active and weekly quota are unavailable/null here; coordinator owns host dispatch accounting. No model fallback or subdelegation; economic savings not established.
Trace: /tmp/n3-referral-code-review.md
Status: completed
