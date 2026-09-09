# Completion — n3-affiliate-bridge
Spec revision: sha256:f8cfa4a2836ce91ac6170e875d1284434b9a49f8db46bdccb731dc8f61617d11

Status: implemented, tested and deployed as a conditional acceptance candidate. Real mailbox delivery and an actual YooKassa TEST-shop purchase/refund have not been performed. Automated coverage below does not close that external acceptance gap.

## Criterion coverage

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-n3-affiliate-bridge-1 | apps/web/tests/n3-proof.test.ts | proof consumption atomically queues signup and rejects replay |
| AC-n3-affiliate-bridge-2 | apps/web/tests/sso.test.ts | непривязанный идентификатор не наследует учётку по неподтверждённой почте |
| AC-n3-affiliate-bridge-3 | apps/web/tests/n3-checkout.test.ts | external intent precedes native create and retry reuses exact invoice |
| AC-n3-affiliate-bridge-4 | apps/web/tests/n3-payment.test.ts | full queue failure rolls back tariff and webhook claim and retry stays available |
| AC-n3-affiliate-bridge-5 | apps/web/tests/n3-payment.test.ts | refund before payment relay applies once and creates explicit manual review |
| AC-n3-affiliate-bridge-6 | apps/web/tests/n3-billing.test.ts | offers an explicit new purchase only after authoritative cancellation and keeps pending retry key |

## Supporting evidence and limits by criterion

1. Proven signup: `n3-proof.test.ts` also covers expired/revoked/foreign proof, owner denial on service-only tables, concurrent issuance cooldown, GET non-consumption and immutable cookie/promo capture. `n3-checkout.test.ts` — `unverified and unacknowledged customer cannot create invoice and foreign project refuses` covers the binding gate. Worker `n3-outbox.test.ts` — `old signup cannot bind a newer same-email proof and acknowledgement uses persisted job fields` fences acknowledgement to the exact proof version. The browser exercised a delivered fragment through a mocked Resend endpoint; no real mailbox receipt is claimed. The proof tests do not individually exercise every 5/account/hour and 30/IP/hour boundary.
2. Identity and attribution: `sso.test.ts` — `параллельные чужие идентификаторы не наследуют passwordless аккаунт` covers the concurrent unsafe-link case. `n3-proof.test.ts` — `landing GET only captures first valid host-only receipt and never verifies` and `immutable signup snapshot keeps original distinct promo and rejects malformed input` cover the separate attribution namespace. The bridge webhook returns before native referral conversion; independent source review checked this placement. No separate end-to-end assertion over both native and N3 commission tables is claimed.
3. Durable checkout: `n3-checkout.test.ts` additionally covers stable keys after lost responses, refusal after 23h ambiguity, exact response envelope and amount/currency/test-mode validation, early-webhook completion recovery without provider IO, and `canceled first purchase requires explicit new key while unresolved retry cannot create another invoice`. Only a persisted terminal cancellation enables an explicit fresh purchase; pending retries reuse the existing invoice. Provider calls in these tests are controlled fixtures.
4. Transactional delivery: `n3-payment.test.ts` — `early webhook recovers native session and duplicate expiry is exactly unchanged`; worker `n3-outbox.test.ts` — `leases fence stale acknowledgement and retry after lost acknowledgement is idempotent`, `network failure remains pending and successful signup acknowledgement marks binding`, and `capacity admission serializes concurrent producers and existing retry works at limit`. Three P1 mutations were killed by behavioral assertions: proof replay, duplicate tariff extension and stale-lease acknowledgement. The browser outage/restart scenario remains unexecuted; durable retry is established at integration-test level.
5. Refund/renewal: `n3-payment.test.ts` — `two distinct concurrent native payments add two complete periods` and `refund HTTP verification fetches original payment and rejects forged provider facts before dedup`. Partial refund replay and manual review preserve the current entitlement; automated subscription proration is outside the agreed policy. The browser checks partial refund and duplicate refund. An actual provider full refund and manual operator resolution have not been performed.
6. Isolated rollout: `n3-proof.test.ts` — `disabled program hides availability and refuses silently dropping a supplied promo`; full existing web/worker/DB regressions and independent review passed. The cross-project browser scenario listed below checks desktop flow and mobile overflow. Root reports deployment with unpublished database ports, separate project networks, and no project02 changes. Tests and admin provisioning do not manufacture email ownership facts.

## Source-bound verification

Implementation commits: `b8f8f83`, `0796989`, `d9f5d6a`; root-owned build alias `aed9bdb`. Root reports deployed Proofwall images from `229e7ee`. Review of both P2 corrections closed on `d9f5d6a`.

- Baseline web: 782 tests. Before review corrections: 811/811. After corrections: 39 files, 812/812 in 72.66s, plus the new billing handler test 1/1 in 710ms separately (its filename changed after full-suite collection; it is not counted in 812).
- Worker: 7 files, 39/39 in 3.96s. DB grants/RLS regressions: 4 files, 18/18 in 2.36s. Full workspace typecheck and production build passed.
- P1 mutations: 3/3 detected with source restored and hashes checked. N3 external-event mutations: 4/4 detected; those are companion-service evidence, not additional P1 unit tests.
- Actual product browser test: N3 `tests/e2e/proofwall-bridge.mjs` — `actual Proofwall browser signup, email proof, native checkout, durable N3 commission and refund review`, 1/1 PASS, total 21459.21808ms, P1 `d9f5d6a` / N3 `acf124e`. Actual Next, worker and N3 services communicated over certificate-verified HTTPS on isolated Unix sockets; Resend and YooKassa were mocked. Its 21 checks include signup, fragment, binding, native checkout, independent provider reads, exactly one TEST commission, zero live payout, reload, duplicate payment/refund, manual review and mobile overflow.
- Root reports subsequent public A–D regression: 49/49 PASS, 37517ms. Public deployment is a separate root report; the isolated browser summary itself correctly says `productionDeploymentVerified: false`.

## Evidence and acceptance boundary

Shared run: `20260909T170258Z-proofwall-n3`, profile `compact-quality-first-v2`, tier XL. Actual host model, token usage/cost and this documentation task duration are `null` where metadata is unavailable; no totals are reconstructed. Root owns final run accounting.

Evidence lives in the companion project's [run directory](../../../../03-affiliate-rewardful/docs/telemetry/p-replicator/20260909T170258Z-proofwall-n3/): `evidence/proofwall-implementation.md`, `evidence/proofwall-review.md`, `evidence/browser-r2-browser.tap`, `evidence/browser-r2-summary.json`, `evidence/external-mutations.json`, `evidence/release-checkpoint.json`. Earlier checkpoint files are historical snapshots and may still say `deployed: false`; current deployment/admin receipts are root-owned.

Root reports the existing tenant was configured without credential rotation or verification changes and without a public DB port. Before unconditional real-provider acceptance, an authorized customer must receive the actual proof email and complete the native 990 RUB TEST payment, then verify durable N3 attribution/commission and refund behavior against the real shop. TEST commission must remain outside payable money. No real charge, real mailbox delivery, bank payout or completed manual entitlement adjustment is claimed here.

Final independent P1 rereview: PASS on `d9f5d6a`, report SHA256 `71b4c88c5cd6e95cca7341bfaeec1807f7cd609e590906d39ee858d3e87f2f05`. The initial `evidence/proofwall-review.md` remains a historical CHANGES REQUESTED report; final PASS is preserved separately in `evidence/proofwall-review-final.md` (root evidence commit `81b190a`).

Subsequent public smoke: N3 `tests/e2e/proofwall-public-smoke.mjs` — `public partner referral reaches configured Proofwall registration over HTTPS`, root reports 1/1 PASS in 2161ms. This verifies the deployed public referral redirect, not mailbox delivery or provider checkout.
