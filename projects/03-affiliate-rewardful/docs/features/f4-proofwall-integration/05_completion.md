# Completion — f4-proofwall-integration
Spec revision: sha256:c78a8ff1abe9efab187b8906d95224d1852820235d6d698da291b1f775f0a424

Status: implemented, tested and deployed as a conditional acceptance candidate. The actual product chain passed with mocked external providers. Real mailbox delivery and an actual YooKassa TEST-shop purchase/refund remain unperformed; AC5 therefore retains an external acceptance condition.

## Criterion coverage

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-f4-proofwall-integration-1 | tests/external-payment.test.mjs | external reservation is durable and concurrent replay never creates a provider payment |
| AC-f4-proofwall-integration-2 | tests/external-payment.test.mjs | external paid event is independently verified and concurrent repeats accrue one test commission |
| AC-f4-proofwall-integration-3 | tests/external-payment.test.mjs | external refunds arriving first settle original payment and cumulatively claw back once |
| AC-f4-proofwall-integration-4 | tests/external-payment.test.mjs | external authority is rechecked after provider IO while ordinary identity can use the pool |
| AC-f4-proofwall-integration-5 | tests/e2e/proofwall-bridge.mjs | actual Proofwall browser signup, email proof, native checkout, durable N3 commission and refund review |
| AC-f4-proofwall-integration-6 | tests/external-payment.test.mjs | pre-bridge schema upgrade preserves native and connector orders as nonexternal |

## Supporting evidence and limits by criterion

1. External intent: the selected regression reserves one durable invoice under concurrent replay without provider creation. `external cap preserves retries; a foreign connector cannot verify another tenant order` covers capacity/replay and tenant isolation. Customer binding remains required before reservation; N3 receives the stable Proofwall invoice key and returns its own external order ID.
2. Verified settlement: `external events refuse wrong metadata, amount, currency, shop and mode without consuming dedup`, `external event rejects missing and native orders before provider work`, and `external public and private replay share dedup; second valid payment cannot replace order binding` cover forged facts, wrong source and shared deduplication. N3 independently GETs provider payment facts; Proofwall's submitted event is not payment authority. Provider responses are mocked in automated evidence.
3. Corrections: the refund-first regression applies original payment and cumulative correction once. The actual-product browser checks partial refund relay, duplicate refund, exactly one TEST commission and zero live payout. P1 exposes manual entitlement review; no automatic subscription proration is claimed. Actual provider refund acceptance remains open.
4. Authority: `connector expiry while final order lock waits rolls back settlement and permits fresh-key replay` covers authority freshness after lock waits. `four stalled external provider reads leave the shared SQL pool usable and bound further admission` covers concurrency and no SQL held across provider IO. Four mutations were detected: external order metadata, paid status, external source and post-IO reauthorization. Independent review checked account→membership→tenant→credential ordering.
5. Merchant contract: the selected browser test ran actual P1 Next, P1 worker, N3 API and N3 account UI, with certificate verification on both browser/server HTTPS. It verifies referral→registration→explicit email proof→customer binding→native checkout→durable settlement→partner-visible TEST commission→reload→partial refund/manual review. Resend and YooKassa were controlled external fixtures; its `real-mail-fragment` check means the real application produced and consumed a mail fragment, not delivery to a real mailbox. This is not a real-shop end-to-end acceptance claim.
6. Compatible release: N3 release `acf124e` was built from deployed F3 baseline `f8055e3` plus bridge changes, excluding unfinished unrelated auth work. Release tests 132/132 and root-reported public A–D tests 49/49 passed. The release regression suite covers existing identity/payments/refunds and MCP/A2A paths. Root reports public deployment on `acf124e`, P1 images `229e7ee`, existing-tenant administrative provisioning without session impersonation/verification changes, no project02 changes, and unpublished databases on separate project networks.

## Source-bound verification

- N3 release checkpoint: `acf124e`, baseline `f8055e3`; 132/132 PASS, 62184.351419ms. Image IDs and deployment status are recorded in `evidence/release-checkpoint.json`.
- Actual product browser: P1 `d9f5d6a` / N3 `acf124e`, 1/1 PASS; subtest 21254.888568ms, total 21459.21808ms. `evidence/browser-r2-summary.json` records 21 checks, certificate-verified HTTPS over isolated Unix sockets, and mocked Resend/YooKassa.
- Root reports subsequent public A–D regression: 49/49 PASS, 37517ms. This later run is separate from the browser summary's historical `remaining A-D UI regressions` gap.
- P1 companion checks: 811 web tests before review fixes; 812 after fixes plus separately collected billing UI test 1/1; worker 39/39; DB 18/18; workspace typecheck/build passed. Both P1 review P2 findings were corrected in `d9f5d6a` and independently closed.
- Mutation evidence: N3 4/4 detected; P1 3/3 detected with source restoration. Mutation results establish sensitivity of the named safeguards, not exhaustive fault coverage.

## Evidence and acceptance boundary

Run [20260909T170258Z-proofwall-n3](../../telemetry/p-replicator/20260909T170258Z-proofwall-n3/), profile `compact-quality-first-v2`, tier XL. Evidence: `evidence/release-checkpoint.json`, `evidence/n3-review.md`, `evidence/proofwall-implementation.md`, `evidence/proofwall-review.md`, `evidence/browser-r2-browser.tap`, `evidence/browser-r2-summary.json`, `evidence/external-mutations.json`. The isolated browser summary intentionally retains `productionDeploymentVerified: false`; `release-checkpoint.json` records the later deployment and public tests. Root owns provisioning and final telemetry.

Target program: existing tenant `b439d03a-1156-48a6-b807-49bf77d44103`, existing P1 TEST shop, public HTTPS product API only. The administrative configuration does not mint owner sessions, customer email proofs or verified purchases. Raw connector/provider secrets are absent from these documents.

Conditional acceptance gap: real mailbox receipt, actual native 990 RUB TEST-shop purchase and provider refund have not been executed. A real provider attempt must establish independent settlement, reload-persistent partner evidence and truthful TEST/live payout separation before AC5 can be treated as externally accepted. Browser outage/restart is also not executed; integration tests cover durable retry/lease behavior. No real-money payout is in scope.

Actual host model and available token/cost counters are `null` when host metadata is unavailable; root owns final elapsed-time accounting. Requested model labels are not evidence of actual execution identity.

Final independent P1 rereview: PASS on `d9f5d6a`, report SHA256 `71b4c88c5cd6e95cca7341bfaeec1807f7cd609e590906d39ee858d3e87f2f05`. The initial `evidence/proofwall-review.md` remains a historical CHANGES REQUESTED report; final PASS is preserved separately in `evidence/proofwall-review-final.md` (root evidence commit `81b190a`).

Subsequent public smoke: N3 `tests/e2e/proofwall-public-smoke.mjs` — `public partner referral reaches configured Proofwall registration over HTTPS`, root reports 1/1 PASS in 2161ms. This verifies the deployed public referral redirect, not mailbox delivery or provider checkout.
