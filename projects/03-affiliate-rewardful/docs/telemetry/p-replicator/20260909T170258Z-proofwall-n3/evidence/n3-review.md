# N3 external payment source review

Completed 2026-09-09 17:54 UTC. RUN `20260909T170258Z-proofwall-n3`; WORK `bridge-n3-review`. Independent readonly review; no source/document changes, database access, secrets, real provider calls, deployment, or subdelegation.

Result: **No confirmed implementation findings in the reviewed patch.** This is a source-review result with the limits below, not full integration/release acceptance.

## Exact source binding

- Main source: `e23ab3ed5eea16e5cf3b66680291e07a34f464b2`.
- Main parent: `bccd5bb43131a2a9b363aadabdf38de47aa9ef96`.
- Release candidate: `0aac8ad86bce1a0e8905ec8ef0481f2e91a47ca4` at `/tmp/n3-proofwall-release`.
- Release baseline: `f8055e36b68f7ed880a8d5c28997801d0ca5cd26`.
- Both commits have stable patch ID `796e15b5d5a10915343e25cc8de0978a62189dd6`; eight changed files, 204 insertions and nine deletions.
- Canonical `02_pseudocode.md` SHA256: `cecb418a726335f79bfae2b13d96a027d7885d45a4323c5ad85435f5f3b1c6eb`, matched locally.

Git blob identifiers (paths relative to `projects/03-affiliate-rewardful`):

| Path | Main source blob |
| --- | --- |
| `apps/api/referrals.mjs` | `21dc0c83a010ea82366af65fbbb9f55eabb521be` |
| `shared/payments/service.mjs` | `549b4cec045cdaf5d82f5f71a473d8b032f940ce` |
| `shared/payments/schema.mjs` | `4657d3d740b0f4394d4c8831294382ece8e366d3` |
| `shared/payments/yookassa.mjs` | `7405da7b61786da3a2d113fe739ceb19ad37395b` |
| `shared/domain/events.mjs` | `be4781d19cda100d94ce3d47d188a162468b054b` |
| `shared/integrations/merchant-client.mjs` | `21e22b07ef22a42e09f5f559ad9347e49bdced1e` |
| `shared/referrals/service.mjs` | `bbac6da3201a4e806af1d191c1835555b4869aba` |
| `shared/identity/service.mjs` | `a46e7ceae578137293bae066cebfd8c0b53439a0` |
| `tests/external-payment.test.mjs` | `162d8450479aaa24ea88e8df0de0a31c0fbc1adc` |

The changed payment/HTTP/client source is identical between main and release. Relevant unmodified release dependencies intentionally differ: `shared/referrals/service.mjs` blob `9421f8ccdb6d882a68a0c8b5e7f77e34dc67a992`; `shared/identity/service.mjs` blob `2ef63f03de6c03dbcb618cd6b742c709c6a77fb1`. The release referral authorizer retains account/version/merchant/key checks and does not import the unfinished main access-verification gate.

## Review conclusions

- Reservation reuses the existing tenant serialization, immutable customer attribution and policy snapshot; the `external:` command namespace is distinct from connector checkout. The new external reservation returns before `completeOrder`, so it cannot call provider payment creation. Existing retries are checked before the literal 5,000-order cap. The additive boolean defaults old rows to false.
- External settlement authenticates and restricts tenant/source/external/shop/mode before provider work. Both authorization passes lock account, membership, tenant, credential, then order. The second pass rereads current credential/account version and order binding; freshness is checked again after persistence and causes transaction rollback on failure.
- Provider IO occurs after the first transaction has committed and before the final transaction opens. The shared provider-operation cap is four; PostgreSQL pool max is four, with bounded connection, statement and lock timeouts. No network operation was found inside the new transaction paths.
- Provider GET normalization verifies returned object ID, shop, test mode, exact RUB amount and timestamp shape. Settlement requires succeeded/paid/captured payment, matching metadata order ID and frozen order amount. A previously bound different provider payment is refused under the order lock. Refund GET identifies its original payment, which is independently fetched and checked against that same order.
- Public webhook and private relay converge on `applyVerified`. Payment and refund domain facts are persisted atomically before order success is recorded. Domain event identity plus immutable input hash prevents changed replay; cumulative refund arithmetic and aggregate over-refund rejection are reused. Refund-before-payment settles the original payment and correction in the same transaction. Test-mode attribution propagates into existing ledger/payout exclusion logic.
- HTTP routes preserve the exact data envelope, reject browser Origin and require shaped bearer credentials. The merchant client adds fixed routes and event input validation; application-specific validation of the reservation response before creating a Proofwall payment remains the Proofwall caller's responsibility under the canon.
- Cross-project separation: the reviewed patch changes no Docker/network/deployment configuration and introduces no P1 database access or container hostname. The merchant client uses only configured HTTPS origin plus fixed application API routes in production; YooKassa uses its fixed public HTTPS API. N3 uses its existing own database pool. Canon requires Proofwall to configure the public N3 origin. Actual runtime origin/network configuration and the P1 half remain outside this source review, so deployed isolation is not inferred from the patch.

## Checks and coverage limits

Independently executed on release candidate: `node --test tests/referral-client.test.mjs tests/yookassa-adapter.test.mjs` — **21 passed, zero failed**, runner duration **169.62346 ms**. These use injected transports, without real network or database access. `git diff --check` passed for source and release patches. Main 163-test, baseline 118-test and four-mutant results were supplied by the coordinator; they were not independently rerun here.

Reviewed new external tests plus existing referral payment and provider integration/adapter tests. The added tests cover concurrent reservation/replay, no provider creation, tampered provider facts, early and cumulative refunds, foreign/native refusal before IO, revocation during provider IO, HTTP/client boundaries and cap retry behavior.

Remaining direct integration evidence gaps, communicated to the coordinator (coverage limits, not claimed bugs):

1. Hold the final order lock while connector authority expires; require rollback and successful replay with fresh authority. The existing revocation hook exercises IO reauthorization but not a final order-lock wait.
2. Submit two independently valid provider payment IDs for the same external order; require one binding/commission and a conflict for the other.
3. Replay the same external payment/refund across both public webhook and private relay, including concurrency; require one fact/correction.
4. Stall four provider reads and exercise an ordinary identity request with the shared pool; require bounded provider admission and continued identity progress. Existing hook-based identity use and referral contention tests are narrower.
5. Upgrade a real pre-bridge test schema with existing native and connector rows through the new boolean migration. Existing migration regression simulates older attribution columns, not removal/readdition of the new external column.

This review does not assess Proofwall implementation, real configured test-shop behavior, cross-project browser journeys, deployed source/build identity, or operational acceptance. Parent owns telemetry. Review duration and token/cost counters were not independently measured and must remain null if no execution metadata supplies them.

## Delta receipt — coverage follow-up

Readonly delta review completed 2026-09-09 17:58 UTC. Main commit `c1ac69d5d9905149959f0a8c77797fd79f4964fe` (parent `c4247b8952f6a8e2532bf3594664d4ace2058e2d`) and release cherry-pick `7f671575c42dcc90fca03c9e02d4d4d4526d32aa` (parent `0aac8ad86bce1a0e8905ec8ef0481f2e91a47ca4`) each add exactly 66 lines to `tests/external-payment.test.mjs`; no production source changes. Stable patch ID matches: `46703d856425495841b95e56c988a2c02632fab7`. Resulting test blob matches: `9ce752cef3d2e6a9958e5d58227a9ea852eb59f5`. Both diffs pass `git diff --check`.

**All five previously listed direct coverage limits are addressed by the added test assertions.** No new confirmed finding from this delta.

| Prior limit | Added evidence in test source |
| --- | --- |
| Final order-lock wait and expiry | A separate PostgreSQL connection locks the order during provider IO; `pg_blocking_pids` must observe a real blocked request before advancing the clock 91 days. The request must reject with `UNAUTHENTICATED`; persisted order must remain `created` with null provider ID. Login/key rotation and replay must produce exactly one payment. |
| Competing valid provider ID | A second succeeded payment copies the verified first payment's amount/shop/order metadata but uses a new provider ID. Relay must reject with `PAYMENT_BINDING_CONFLICT`; original provider ID remains on the order and only one payment exists. |
| Public/private replay | Payment and refund are each concurrently delivered through webhook and private relay. Assertions require one payment, one refund, zero net ledger after full refund, and unchanged original provider binding. |
| Four stalled provider reads and shared SQL pool | Four provider reads must all reach a controlled stall. Ordinary identity lookup must complete before the stall is released. A fifth event must reject with `PROVIDER_BUSY`, and provider entry count stays four. Released requests converge to one payment. |
| Pre-bridge boolean migration | Existing native and connector orders are created, the external column is dropped, and app restart reruns migration. Both rows must receive false, both native settlement paths must work, and the external relay must reject both old orders. |

Coordinator reports full main verification **167/167** and build **126 modules**. This delta review inspected assertions and exact hashes; it did not rerun the full suite or access a database. The coordinator's release-candidate execution receipt remains the authority for execution on `7f67157`. Earlier broader limits concerning Proofwall, real providers, browser journeys and deployed isolation remain applicable; the five test-coverage items above are no longer outstanding source-review recommendations.
