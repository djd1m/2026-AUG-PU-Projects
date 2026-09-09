# Proofwall N3 bridge implementation receipt

RUN_ID: 20260909T170258Z-proofwall-n3
WORK_UNIT_ID: bridge-proofwall-implementation
Owner: /root/bridge_proofwall_research
Profile: parent-selected high-risk approved feature implementation; bounded child scope.
Actual model: null (host identity unavailable to this child; no inferred model label).
Usage/token/cost counters: null. Total implementation duration: null (start timestamp not preserved, not reconstructed).
Workspace: /tmp/proofwall-n3-bridge
Telemetry: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful/docs/telemetry/p-replicator/20260909T170258Z-proofwall-n3 (root-owned).

## Inputs and authorization
Root and project CLAUDE/local rules, approved five-file P1 feature catalog and canonical P3 pseudocode were read. Parent authorized implementation after scoped traceability/report-revision/criterion-scenarios gates passed exact six criteria. Parent owns release isolation, manifests, configuration, deployment and source integration.
Canonical N3 02 input SHA256: cecb418a726335f79bfae2b13d96a027d7885d45a4323c5ad85435f5f3b1c6eb.
P1 02 input SHA256: ff1091b8f534566cf9475ebe86deeedaa8ee80e4e57213f6adb5cd1ff90f83e9.
P1 specification SHA256: f8cfa4a2836ce91ac6170e875d1284434b9a49f8db46bdccb731dc8f61617d11.
Prior research and validation: /tmp/n3-bridge-proofwall-research.md, /tmp/proofwall-bridge-validation.md, /tmp/n3-bridge-validation.md, /tmp/bridge-validation-receipt.md.

## Delivered behavior
Service-only additive migration019 stores immutable signup context, session-bound hashed email tokens and completed proof, stable checkout invoices, bounded durable outbox and explicit manual refund reviews. Existing checkout_sessions role grants remain unchanged. Root applied migration only to isolated fixture database before tests.
The /n3/start landing captures first valid fixed-tenant HttpOnly/Secure host cookie and redirects to registration. Registration snapshots trusted cookie and separate N3 promo atomically. Signup requires current-account/current-email/current-session ownership proof, explicit POST consumption, and confirmed Resend delivery status. Equal unverified email never auto-links an unrelated SSO identity, even for passwordless accounts.
Referred checkout waits for N3 signup acknowledgement, commits its native invoice before network IO, reserves the N3 external order, validates exact amount/currency/test mode and then creates the native YooKassa payment with stable invoice idempotence and order metadata. Provider ambiguity preserves the invoice and refuses blind recreation after 23h. Completed early webhook invoices recover directly to the trusted dashboard.
Payment/refund webhooks independently fetch provider facts and bind them to persisted invoice/project/order before atomic tariff, event claim and outbox writes. Replays preserve exact paid_until; concurrent distinct purchases add full periods. Bridge orders bypass native referral commissions. Refunds enqueue automatic N3 correction and create visible P1 manual entitlement review; subscription proration is deliberately not automated.
Worker polls the durable outbox with 60s fenced leases, batch 10, max 4 concurrent HTTP requests, 5s nonoverlap ticks, 8s total deadline, 1MiB responses, exponential 60s–3600s retries and atomic 10000 pending capacity. Replay at capacity remains possible. Only HTTPS public N3 API is used; no cross-project network, Docker hostname, shared database or provider credential is introduced.
UI exposes proof, delivery/binding, TEST payment and manual refund review states. Optional N3 promo field appears only when configured and server refuses to silently discard a submitted promo if disabled.

## Verification evidence
Initial parent baseline web 782/782 passed before implementation. Parent later full worker 34/34 passed in 3.44s, including queue capacity concurrency. Child final web run passed 39 files/811 tests in 61.99s. Child DB regression passed 4 files/18 tests in 2.36s. Full workspace npm run typecheck and npm run build passed (Next routes, widget, transcribe, worker). Transport follow-up suite passed 4/4 in 304ms and workspace typecheck passed again.
Commands from P1 workspace:
- npm run typecheck
- npm run build
- npm run test --workspace services/worker -- tests/n3-client.test.ts
- PROOFWALL_TEST_SOURCE=/tmp/proofwall-n3-bridge/projects/01-testimonials-senja docker compose -f /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja/compose.bridge-test.yml run --rm backend npm run test --workspace apps/web -- --no-file-parallelism
- Same container invocation: npm run test --workspace services/worker (parent execution)
- Same container invocation: npm run test --workspace packages/db
- node /tmp/proofwall-bridge-mutations.mjs
Mutation evidence: /tmp/proofwall-mutations.json and /tmp/proofwall-mutation-{proof-replay,duplicate-tariff,lease-fence}.log. All 3 mutants killed by intended AssertionError behavior, not compilation/SQL syntax: repeated proof consumed 8 instead of 1; duplicate tariff extended expiry; old lease falsely acknowledged. Every mutated source restored in finally and verified SHA256-equal. Mutation execution measured 19:06:28.752Z–19:06:39.408Z. Initial sandbox-denied attempt was not counted as a mutation kill.
All owned changed source/test files below 500 lines; diff --check passed. SSO test file split preserves unrelated security cases; only unsafe equal-email acceptance cases changed to failclosed expectations, plus source guard reflects that requirement.

## Boundaries and remaining parent work
This child did not deploy, access secrets, call real Resend/YooKassa/N3, join production networks or alter project02. Browser and end-to-end cross-service HTTPS evidence, real mailbox receipt and provider TEST purchase/refund acceptance remain parent-owned and are not claimed here. Local suite uses controlled mocked transport and isolated SQL/MinIO fixtures. Runtime provider latency, real email delivery and production key/tenant configuration are not established by these tests.
Native legacy payment verification is additionally performed by the bridge dispatcher before legacy fallback; this means a non-bridge recognized payment can require two provider GETs. Disabled bridge retains persisted invoice ownership for eventual webhook delivery. Malformed/unsupported provider facts failclosed and require retry/reconciliation; the child provides no operator automation for manual entitlement review.
Build requires root-owned next.config extensionAlias commit aed9bdb, excluded from child source commits. That is the only remaining modified file in the isolated worktree after source commits.

## Source identity and completion
Implementation commit: b8f8f83a4d5c6c14ed12338030b25bab554f8bda.
Transport follow-up commit: 07969894872d18bd59d89277c787a9d6cfef3469.
Final follow-up full workspace build and typecheck PASS after exact HTTP200 change.
Final source manifest: /tmp/proofwall-n3-source-shas.json (35 paths); SHA256 3a7db0de04137dff97ce1a1e19e4e5f251eb40ac4e498bbc5261abf9f8196080.
Completed at: 2026-09-09T19:12:22.225023+00:00.
Status: completed
