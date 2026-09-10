# Core implementation receipt

RUN_ID: 20260910T071401Z-agent-payments-implementation-7e80
WORK_UNIT_ID: core
Completed at: 2026-09-10T08:31:46.362097+00:00
Commit: 8253f4155f7b536f793a625b7295e6983d2a98df
Worktree: /tmp/agent-payments-core-7e80
Owned scope: projects/01-testimonials-senja/packages/agent-payments/**
Worktree status after commit: clean.
Canonical input implementation-contract SHA256: 251b171f20b6903bbbb57a25488116316e63de9f0ac6b7662f4765088a01abf5
Final public contracts SHA256: f9caa79bf2e82fb3cf8ad39f35a888e999a6f5abbd367d6f628c48812aa48a8f
Source manifest SHA256: a2ed6136784ee92f442428b6c548b51c918f4565a568b9d5f9a11183e883ec09

## Delivered
Portable private @course/agent-payments ESM TypeScript Node22 package, independent package/lock/build.
PostgreSQL namespaced migration and externally injected Pool; scoped hash-only grants and distinct human consents/mandates/methods.
Persisted authoritative quotes/orders; scoped idempotency hashes; human hosted approval without mandate; bounded saved-method execution.
Shared buyer gross-spend budget reservations across grants/mandates/resources, billing period claims, permanent dispatch fence, pre-fence revocation, query-only unknown recovery.
Verified provider identity persists before fulfillment; payment, gross spend, host-local entitlement, event and outbox effect share exact PoolClient/transaction.
Separate durable cumulative refunds, idempotency, refund-before-paid recovery, account/TEST/amount/metadata matching; late paid never reverses known refund.
YooKassa TEST-only adapter with host metadata extension and reserved module scope metadata; backend-only method references, no secret import side effects.
HTTP command adapter; standalone observeHumanSpend and lockBuyer exports for legacy integration. Root owns MCP/A2A gateway and host identities/pairing/integration.
README explains trust boundaries, provider recovery limits, transaction/lock requirements, human observation and uncapped explicit extra human purchases.

## Actual verification
- npm run build --workspaces=false: PASS after final source formatting and export changes.
- node --test test/postgres.test.mjs test/provider.test.mjs in node:22.22.0-bookworm-slim on proofwall-agent-payments-test_database: PASS 44/44, 0 failed, 0 skipped. Includes 30 real PostgreSQL tests and 14 provider fixtures. Measured TAP duration 1642.581266 ms.
- node test/mutation-check.mjs on same isolated PostgreSQL network: PASS 3/3 intentional guard mutations killed by targeted AssertionError (shared budget, provider merchant binding, settlement deduplication). Compiled files restored.
- node test/extraction-check.mjs: PASS packed module installed into independent consumer with only package dependencies via npm offline cache, two products/different prices complete actual PostgreSQL purchases without attribution.
- Source boundary scan: PASS no host/framework/absolute imports in src; all tracked candidate files under 500 lines.
- git diff --cached --check: PASS. Source manifest verification after commit: 20/20 hashes match.
Evidence: packages/agent-payments/docs/evidence/tests.tap, validation.json, source-sha256.txt (relative to P1).
Test-only database credentials supplied by coordinator env file without printing its values. No ports published, no new database container, no deployment or live payment.

## Limits and measurements
Real YooKassa TEST saved-method acceptance has not been performed; fixtures do not substitute for it.
Host browser/CJM, legacy payment ownership, actual gateway clients and worker delivery integration remain coordinator work units.
A fenced attempt with lost provider ID requires verified notification or operational lookup. No blind create retry, even after PSP idempotency expiration. A crash between fence and network may need manual investigation; reservation remains held.
Final canceled period claims retained conservatively; no automatic fresh attempt in v1. Shared calendar/cap increases require explicit future policy migration.
Deferred fulfillment requires a durable host worker; no standalone remote-fulfillment receipt command in v1.
Profile: compact-balanced-v1, risk XL. Requested model gpt-6-astra, effort high per coordinator. Runtime actual model/effort unknown. Work-unit started_at/elapsed/active, usage and cost null because authoritative start and runtime counters were not captured. No estimates or savings claim.
Root telemetry: projects/01-testimonials-senja/docs/telemetry/p-replicator/20260910T071401Z-agent-payments-implementation-7e80/; package evidence carries work-unit missing_data explicitly.

## Source hashes

```text
1ab6ab4401a18d2a70806793e801e1bbc6a14bfd35a5ae19a11e3a38f18ea8f0  README.md
6c02c4d462fbdfa7485747986a68d7351d8924771aa9ab7050a9df0940d897e8  package-lock.json
3910fc3521401ccd3016fc8e4bb32d99a407ac5b0cfd39de82799fc06b40feda  package.json
c3bba9c38915db1f96f53bd15319bf0a966166dafa81c45e44f36ee5b0fdd3d1  src/authority.ts
5cff1af67704f6a13855bdc3903d7d93453b75fa21279fd2819c95d19568390c  src/budget.ts
f9caa79bf2e82fb3cf8ad39f35a888e999a6f5abbd367d6f628c48812aa48a8f  src/contracts.ts
2af74c976a660d6096f53b41cae020163510bc7ad59b9089d2cdaf49dac9322b  src/execution.ts
9a74d4c5a0d93a3b41a05f455db69828bb4cbb1228586c5dbe71f94ca8b18ec2  src/index.ts
c9a258abd1347d3594351803becf90a272d232b5666f8013e2e571642ae080c8  src/internal.ts
350ae7232b70ffe7ef1561709c322a202a88228a0af172f25300610d167387dd  src/orders.ts
52c9e43cf71cd4bd363f846d16e5dabf6d604181ad04b166517a118a099f14a7  src/provider-yookassa.ts
15f93fb5de36bfb9a1e07587e4dc411f37fa51bf275109dd38b74918202b3d69  src/settlement.ts
c09491709be1879a2c12dfa89b843885dfb261fb0a2340ebeb86636c139c8642  src/store.ts
5a2e19005ba673608a45e511df3af67c3b40fac24f44a7da6b290693c8379ab4  src/transport-http.ts
10413210d791988b8e33c4f2cbbcf80add563788f8347b3a3780adf9e0f92a83  test/extraction-check.mjs
16454a4da5c39cf90041022fa2fffb9852134e0db241ad9be239f2c53abf8d5e  test/mutation-check.mjs
eb79751c25e5eae87baf95691e8cb34aa3671861ffd5594655cf8f8cf58803af  test/postgres.test.mjs
af3eb49d88d2950c27b4424ecef793ba29de67bd72af0f4af5d99303517e2178  test/provider.test.mjs
5e85deeb9f01412d4d08404b1c1f3be6d74d0af759b43eb34ed5ae6b5be5cf89  test/reference-host.mjs
da7b88b0eb41c2cc3acb366d0634a5ecb3fad99c00739b0fb429869d5f5c70a5  tsconfig.json
```

Status: completed
