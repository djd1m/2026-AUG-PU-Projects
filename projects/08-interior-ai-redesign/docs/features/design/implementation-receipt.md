# Design implementation receipt
RUN_ID: 20261013T220722Z-design-5c13
WORK_UNIT_ID: design-author-1
Started: 2026-10-13T22:46:24.420346Z (coordinator prelaunch timestamp; initial placeholder timestamp corrected before delivery)
Requested model: gpt-6-astra high; actual model/effort: null (host metadata unavailable).
Usage/cost: null (host counters unavailable).
Profile: compact-quality-first-v2; risk XL (cost, ownership, lease fencing); approved source plan reused.
Scope: domain/design, db/design, OpenRouter adapter, jobs/watchdog, design routes and tests only.
Applied memory: cjm-design (new draft invalidates approval); procurement-budget (unknown cost remains unknown); project-work (one implementation then specific finding corrections).
E2E preflight: not_applicable — this unit provides domain/real-PostgreSQL/offline-provider tests; browser integration owned by coordinator.
Status: running

Clock checkpoint: 2026-10-13T22:55:43Z. Earlier conversational 45-minute checkpoint was an incorrect estimate, not measurement.

Implementation boundaries:
- Pure strict scene/catalog schemas and immutable shell validation; manual rotated AABB / opening exclusion, GLB fit unconfirmed.
- PostgreSQL catalog/history/create/approve/restore, owner/CAS/shared100-revision bound and same-project JSON IDs.
- Durable consent snapshot, replay-before-eligibility, global mutex/account/project/origin-ledger/job ordering, UTC admission5/20 and outstanding old-day holds.
- Fenced max3 claim, once-only dispatch mark, expiry/sweep, no post-dispatch retries, current-vs-detached result and archive/refund suppression.
- Exact known/null/overrun accounting, held-credit outcomes and local operator evidence reconciliation (no public route).
- Fixed OpenRouter GET key limit proof before mark + one bounded strict-schema POST; test injection only NODE_ENV=test. Default manual and explicit no-cost demo fixture.
- HTTP design/catalog/job routes, prebody ownership preserved for archived idempotent replay.

Validation evidence:
1. `node --env-file=<private test.env> node_modules/vitest/vitest.mjs run tests/design --maxWorkers=1`: 32 tests passed before two final additive regressions.
2. `... vitest ... run tests/design/http.test.ts`: 1 passed; foreign project rejected before getReader while archived owned request may reach parser/replay.
3. `... vitest ... run tests/design/provider.test.ts`: 6 passed (includes new complete HTTP+PostgreSQL worker integration). Unique own test total34.
4. Full isolated suite: 58 passed /1 failed due stale copied foundation config fixture lacking newly-required overhead. Copied coordinator's already-fixed fixture; affected foundation/config suite3 passed. No product-code failure hidden. No PostgreSQL restart interruption observed in this unit's tests.
5. `node tests/design/mutations.mjs`: shell-hash and dispatch-once mutations both exit1 with relevant expected assertion failures; originals restored in finally. Red outputs/results under tests/design/mutation-evidence/. Restored sources subsequently passed full suite own tests.
6. `npm run lint`: exit0. `npm run typecheck`: exit0. Isolated `npm ci --ignore-scripts`: audit0 vulnerabilities (installation only, not live provider test).
7. Initial Next build failed because isolated copied config lacked coordinator's .js extensionAlias; copied existing root fix. Subsequent build passed. Final source build result appended below.

AC coverage owned by this unit:
- AC1–2 strict measured scene/domain fixtures; viewer camera/UI evidence remains coordinator scope.
- AC3–5 immutable revision/restore/CAS tests; quantity/UI shopping warning integration remains procurement/coordinator scope.
- AC6 manual no-job and labelled demo worker test; browser visible label coordinator scope.
- AC7 config fail-closed foundation fixture, malicious definite response accounting, fixed provider limit proof tests.
- AC8 multiple DB connections admission/claim/fence and exact-once dispatch tests.
- AC9 before/after-dispatch lease crash, max3 attempts, uncertain holds/no retry, evidence reconciliation tests.
- AC10 actual local HTTP provider fixture through production adapter/worker + PostgreSQL: saved body exact, one POST, one draft, consumed credit, both ledgers31microUSD; zero external provider network.
- AC11 replay after archive/billingHold/CAS; SQL barriers archive/refund before and after mark; newer manual result detached; SQL immutable consent inputs.

Source binding: tests/design/artifact-manifest.json (33 owned source/test/evidence files), SHA256 16487ecb6d6ea15b037917ad721e1be2c2a426d83e7f231cce49eed88ef19a9c. Root-owned readonly dependencies copied: config, Next config, API client, viewer src, migration003, foundation config fixture; do not integrate these copies as author-owned changes.

New confirmed memory: canonical original root dz teach --no-mirror ID teach:f8472c8058ed7124, separating prebody ownership from mutable eligibility in archived replay. Tool default reward0.8 is not a measured effectiveness result.

Limitations: independent review, complete application/browser integration, live provider capability/quality, paid billing and public release are not certified by this author receipt. No live paid calls or public deployment performed. Actual model/effort and token/cost counters remain null; requested Astra high does not prove runtime model. No baseline; savings unestablished.

Final source `npm run build`: exit0 (Next15.5.27 compiled/types/routes successful).
Ended: 2026-10-13T23:03:12.951932+00:00
Elapsed wall ms: 1008531 (includes reading/tools/coordination; active duration unknown, no separate wait interval accounting).
Usage tokens / cost: null; measurement gaps remain host model metadata, effort and usage counters.
Status: completed
