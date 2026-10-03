# F15 bounded implementation receipt — implementation-1

Run-ID: 20261003T053651Z-source-management
Work-Unit-ID: source-management-implementation
Attempt-ID: implementation-1
Source-Revision: c7e5c65fcf7d880c8eae686d4221053085ca692f
Build-Revision: none (no production build executed by this coder)
Launch-SHA256: 73bc43d7d1edafde492e27e39ac0b927cf771c3bef9b1c6a295a5cacf8b3d835
Project-Root: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-source-management/projects/06b-rag-class
Trace: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-source-management/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T053651Z-source-management/evidence/implementation-1-receipt.md

Bounded author work is complete. This is an implementation handoff, **not final F15 acceptance**.
Coordinator retains telemetry, integration, real PG/full regression, Docker UI, independent review and acceptance.

## AC map

| AC | Implementation and evidence | Remaining verification |
|---|---|---|
| SRC-01 | DELETE route, Origin/session/RLS, exact409, all-row rollback, explicit child removal; unit green; PG retrieval/rollback/race tests authored | execute real PG |
| SRC-02 | site/PDF recrawl202, same live handle, fresh defaults, bytes/docs/chunks preserved; worker hash-reuse test authored | real worker/PG with fake model |
| SRC-03 | latest task created_at DESC/id DESC, progress, confirmed delete, recrawl, pending/error states, existing site/PDF controls | Docker browser1440/390 |
| SRC-04 | session/tenant two-count stats, strict7d widget/demo scope and three unknown outcomes, published display + Add source | real PG cutoffs and browser |
| SRC-05 | startup/daily retention, strict30d/Moscow-2d,1000-row batches,max20 per transaction, backlog continuation, advisory non-overlap, stop awaits cleanup | real PG boundaries; worker runtime |
| SRC-06 | 16 real PG tests authored across three files; API409, source/oldretry/worker barriers, cascades, other tenant, handover, stats/retention; local Origin mutation RED→GREEN | execute PG and default delete-guard mutation |
| SRC-07 | frozen source/test SHA256 map, bounded scope and explicit handoff | full unit/PG regression, production build, Docker UI/hash binding/cleanup, fresh independent review |

## Checks actually executed

- `npm run typecheck`: exit0, root and web TypeScript.
- `npx --no-install vitest run --config vitest.config.ts apps/web/tests/unit/source-management-handler.test.ts apps/web/tests/unit/source-management-ui.test.ts apps/web/tests/unit/jobs-handler.test.ts services/worker/tests/unit/retention.test.ts services/worker/tests/unit/job-guards.test.ts services/worker/tests/unit/source-management-loop.test.ts`: exit0,31tests/6files; reported duration2.44s.
- `node scripts/mutate-source-management-guard.mjs --origin`: exit0. Fixed Origin assertion baseline1passed,
  mutation1failed (404≠403), restored1passed; bytes restored SHA256
  2a37b7b54482f6a8acd205836827fa6f13bea6aea53f1e827c928c748122e79a.
- `git diff --check`: exit0.
- Initial focused run:28passed/1failed from assertion matcher inspecting trap-pool Proxy; fixed test fixture,
  subsequent29passed; final31passed after retention backlog and actual-loop lifecycle tests. No product failure hidden.
- PG, network, Docker, browser, paid requests, build, independent review, commit and push: **not executed**.

## Files and snapshot

23 product/source/test/script files below are bound in
`tests/artifacts/source-management/implementation-source-hashes.json`.
Snapshot-file SHA256: 70471b359546817533f6bd3bddb40f735b93fed4994895e22d5975e3c28b0245
Digest method: SHA256 raw bytes per file; sorted project-relative path map; snapshot file UTF-8 JSON with trailing LF.
Build identity none; unchanged dependencies/source are bound through baseline revision. No source edits after snapshot.

- `apps/web/src/app/api/bots/[id]/stats/route.ts`
- `apps/web/src/app/api/sources/[id]/recrawl/route.ts`
- `apps/web/src/app/api/sources/[id]/route.ts`
- `apps/web/src/app/cabinet/add-source.tsx`
- `apps/web/src/app/cabinet/bot-stats.tsx`
- `apps/web/src/app/cabinet/page.tsx`
- `apps/web/src/app/cabinet/source-actions.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/server/runtime.ts`
- `apps/web/src/server/source-management-handler.ts`
- `apps/web/tests/unit/source-management-handler.test.ts`
- `apps/web/tests/unit/source-management-ui.test.ts`
- `packages/db/src/index.ts`
- `packages/db/src/jobs.ts`
- `packages/db/src/source-management.ts`
- `packages/db/tests/int/source-management.test.ts`
- `scripts/mutate-source-management-guard.mjs`
- `services/worker/src/loop.ts`
- `services/worker/src/retention.ts`
- `services/worker/tests/int/retention.test.ts`
- `services/worker/tests/int/source-management.test.ts`
- `services/worker/tests/unit/retention.test.ts`
- `services/worker/tests/unit/source-management-loop.test.ts`

Evidence: `docs/features/source-management/02_validation.md`, this completion file,
`tests/artifacts/source-management/{focused-tests,typecheck,mutation-origin}.txt`.
Necessary scope corrections recorded in validation: integration tests use existing `tests/int`, not excluded
`tests/integration`; mutation output is an extra AC06 evidence artifact. No manifests, grants, schema or global config edited.

Lock discovery: deletion uses source FOR NO KEY UPDATE to avoid worker job-FOR-SHARE/source-FK deadlock.
Existing enqueueSiteSource and recrawl explicitly lock source FOR UPDATE; job DELETE RETURNING locks retry contenders
using existing DELETE privilege. Live state causes transaction rollback restoring all tentatively deleted jobs.
Final source FK deletion remains atomic against direct SQL inserts. Real PG worker-FK barrier is authored to prove this.
Worker reuse integration uses an explicit extractor fixture and fake provider; it claims no live crawl/PDF/browser or paid indexing.

## Coordinator next steps (commands as data, not executed here)

1. Bind source hashes to candidate build and independently review lock/RLS/lifecycle obligations.
2. In authorized internal DB environment execute `npm run test:int -- packages/db/tests/int/source-management.test.ts services/worker/tests/int/source-management.test.ts services/worker/tests/int/retention.test.ts`.
3. Execute `node scripts/mutate-source-management-guard.mjs` for real-PG delete guard fixed oracle and byte-exact restore.
4. Complete full unit/PG regression and production build. Execute read-only E2E preflight, actual Docker UI1440/390,
   source/build binding and cleanup under coordinator mutex; accept only fresh independent review.

Profile: compact-quality-first-v2; substantive M, repeated mechanical S/exit0.
Requested model/effort: gpt-6.1-sol/high; exact per-attempt actual host model/effort not exposed here.
No fallback or child agents invoked. Usage/tokens/cost/active-time: null, counters and waiting attribution unavailable;
no estimated usage reported. Savings not established. Coordinator owns existing run telemetry.
Snapshot timestamp: 2026-10-03T06:00:43.207455+00:00. Elapsed since recorded launch: 1139.983s, within1500s bound.
Remaining work owner: coordinator; no external blocker discovered in this bounded attempt.

Status: completed

## Координаторская приёмка — 2026-10-03T06:40:21.421420+00:00

SRC01..07 приняты на b3df79f3c748c426d7eac16717008ccd121eb10e, snapshot2aa1bd4b8d2585254ff21b793a40d71fbcdca5d4bdb89a0fe81eb00a3ec2c978.

Full corrected646unit/310PG/type/appbuild/productionweb+migrate0; exact23host/immutable runner match. Real R1 old early-guard removal reaches verified DELETE owns liveL/waits retry-heldF and fails503vs409; exact-byte restoreGREEN. Independent late RETURNING guard mutation fails deletedvsbusy thenrestoreGREEN; Originmutation also meaningful. Fresh Astra correction ACCEPT_WITH_CAVEATS source/no furtherfinding; its runtime/UI caveats closed by coordinator evidence. Initial full308PGpass/1fixturecastfailure and artifactJSON write-permissionfailure preserved; separateSol corrected integer fixture cast and R1, coordinator fixed ownartifactwritepermission. No unchanged fullsuite repeated without productionchange.

Actual Docker Next UI1440/390 passed: real registration/createbot/publication, numeric3questions/2unknown stats with widget/demo and sandbox/old exclusions, Add source anchor and actual site202, recrawl new202 and same-live idempotent handle, busy delete409 preserves all rows, cancel confirmation preserves source, confirm204 removes source/documents/chunks/jobs while other source remains, deleted routes404, zero JS errors and no overflow. Six screenshots inspected. Isolated owner fixture explicitly completes jobs and seeds document/chunk/question rows; no browser crawl/provider/model claim. Real worker/PG hash-reuse proof is separate. Actual product requests unmocked; own contexts/stack/network/private env removed, shared browser retained, test password absent from service log.

Actual Sol6.1high/Astramedium, CLIsubtotal5481502, elapsed3810215ms. Coordinator/costunknown; следующийrelease-gate, публичныйстенд/живуюкалибровку не объявляем выполненными.
