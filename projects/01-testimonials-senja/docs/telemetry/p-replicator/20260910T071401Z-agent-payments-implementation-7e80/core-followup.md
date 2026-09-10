# Core review follow-up receipt

RUN_ID: 20260910T071401Z-agent-payments-implementation-7e80
WORK_UNIT_ID: core-followup
Completed at: 2026-09-10T08:45:14.453129+00:00
Commit: 043d7a1eb7c9bd67d0406a5ba41b4959bf44b2c6
Parent core commit: 8253f4155f7b536f793a625b7295e6983d2a98df
Worktree: /tmp/agent-payments-core-7e80; clean after commit.
Ownership: projects/01-testimonials-senja/packages/agent-payments/** only.
Public contracts.ts unchanged: f9caa79bf2e82fb3cf8ad39f35a888e999a6f5abbd367d6f628c48812aa48a8f
Source manifest SHA256: ad5aef1a96222647b5e19c41bd124a5801974bf4691114d21a3a6cf405d92d9a

## Resolved review findings
- Proven provider cancellation and pre-fence denial release held reservations and period claims only when scope and source_id match the canceled order. Fresh quote/new key can authorize same period again; canceled order itself stays canceled.
- Exported trusted host helper abandonUndispatched(client: PoolClient, scope: Scope): Promise<string[]> cancels all scoped unfinished orders only without any dispatch fence, takes buyer lock inside existing host transaction, releases owned claims/holds, and returns IDs for atomic host bookkeeping. Caller must acquire host project lock first. Unknown/fenced payments and another owner's claims remain untouched. Missing linked attempt is treated conservatively.
- Execute rechecks terminal state inside reservation transaction so snapshot-before-abandon cannot resurrect a canceled order; fence rechecks canceled state so abandon-after-reservation cannot dispatch.
- Already-paid reconcile uses local durable fulfillment recovery without PSP dependency. Retry reuses original paid event ID/version even if outbox acknowledged, commits on same client, creates no new event/spend, and leaves paid/pending on callback rollback. Concurrent retries grant once; refund suppresses old entitlement replay. Host worker must select succeeded/pending orders (host owner notified).
- reconcileRefund validates stored Attempt.provider/accountId against current provider before querying refund, and rechecks inside settlement transaction. Verified providerId/currency/refund account/mode checks remain.

## Actual checks
- TypeScript build: PASS.
- Isolated real PostgreSQL plus provider fixtures: 58/58 PASS, 0 failed, 0 skipped; 44 PostgreSQL tests (14 added) and 14 provider fixtures. Exact saved TAP duration 1589.255868 ms.
- Added tests cover definite canceled retry, new authorization after pre-fence revoke, snapshot/reservation/fence abandonment interleavings, concurrent abandon/execute, in-network accepted fence, unknown preservation, scoped owned claims, host rollback, stable deferred event retry/rollback/refund, switched refund provider/account and direct reducer replay.
- Safety mutation gate: 3/3 intentional mutants killed by AssertionError. Settlement mutation now explicitly exercises direct verified reducer replay because successful reconcile is query-free.
- Packed isolated consumer: PASS with two different products/prices and no attribution, npm-installed package only, actual PostgreSQL purchase.
- Source boundary/under-500-lines checks: PASS. git diff --cached --check: PASS. 23/23 source hashes verified after commit.
Evidence under package docs/evidence: followup-tests.tap, validation.json, source-sha256.txt. Earlier tests.tap retains original baseline evidence.

## Profile correction and limits
Correct profile is compact-quality-first-v2. Initial core.md and first package validation record incorrectly named compact-balanced-v1; this receipt and updated validation.json explicitly correct that metadata. Requested model gpt-6-astra / effort high. Runtime actual model/effort, authoritative work-unit start/elapsed/active, token usage and cost remain null because host counters/start were unavailable. No estimated usage or savings claim.
No deployment, live charge, or real YooKassa TEST saved-method acceptance. Host identity/pairing/legacy cutover/browser flows and gateway validation remain coordinator-owned. Unknown fenced outcomes still require verified provider lookup/notification and never trigger blind create retry. There is no independent remote-fulfillment receipt API; local durable retries are implemented through reconcile.

## Source hashes

```text
698b51f6be48b01e50d8af1fdd01a872a27173b6a33d09a2432f42009f05ecfe  README.md
6c02c4d462fbdfa7485747986a68d7351d8924771aa9ab7050a9df0940d897e8  package-lock.json
8b6512bb3782f84b82bfa8a1b374c981033b74a03901cb5df97827d7320c370b  package.json
c3bba9c38915db1f96f53bd15319bf0a966166dafa81c45e44f36ee5b0fdd3d1  src/authority.ts
5cff1af67704f6a13855bdc3903d7d93453b75fa21279fd2819c95d19568390c  src/budget.ts
b4a9fd20c2b90ac7ab8d02f226021aee586dabc2bd3ae1e0fa76b60f07ab6827  src/cancellation.ts
f9caa79bf2e82fb3cf8ad39f35a888e999a6f5abbd367d6f628c48812aa48a8f  src/contracts.ts
c9845da72cf0109cff190c8cc4871ec7b479497a22dbd25745e9fb8da8af9b99  src/execution.ts
ef4d38a0a96117ae2c2c221275ad365eca15eb5458f23183beea834c716292e3  src/fulfillment.ts
02a8561d0253fd762045a4f3c09a240a1816f402e1dec260e58d86b265c821fe  src/index.ts
c9a258abd1347d3594351803becf90a272d232b5666f8013e2e571642ae080c8  src/internal.ts
350ae7232b70ffe7ef1561709c322a202a88228a0af172f25300610d167387dd  src/orders.ts
52c9e43cf71cd4bd363f846d16e5dabf6d604181ad04b166517a118a099f14a7  src/provider-yookassa.ts
5c486f0df5fcdc3fecb27c15fe97ef9d6ef3557e41b4bd201297d73fe66dbb2e  src/settlement.ts
c09491709be1879a2c12dfa89b843885dfb261fb0a2340ebeb86636c139c8642  src/store.ts
5a2e19005ba673608a45e511df3af67c3b40fac24f44a7da6b290693c8379ab4  src/transport-http.ts
10413210d791988b8e33c4f2cbbcf80add563788f8347b3a3780adf9e0f92a83  test/extraction-check.mjs
220a62a099716fdd9aa3bae3015aec1e5fba72ed9458d13cbf6160782346bada  test/followup.test.mjs
a19acf0cbd55590386db5d3cff2c99f547e619ca9211a8ea1461a1a035b3599b  test/mutation-check.mjs
eb79751c25e5eae87baf95691e8cb34aa3671861ffd5594655cf8f8cf58803af  test/postgres.test.mjs
af3eb49d88d2950c27b4424ecef793ba29de67bd72af0f4af5d99303517e2178  test/provider.test.mjs
5e85deeb9f01412d4d08404b1c1f3be6d74d0af759b43eb34ed5ae6b5be5cf89  test/reference-host.mjs
da7b88b0eb41c2cc3acb366d0634a5ecb3fad99c00739b0fb429869d5f5c70a5  tsconfig.json
```

Status: completed
