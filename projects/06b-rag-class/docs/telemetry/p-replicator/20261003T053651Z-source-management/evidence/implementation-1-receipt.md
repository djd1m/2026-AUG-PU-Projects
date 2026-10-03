Bounded F15 implementation is complete. **F15 acceptance remains pending coordinator verification.**

Run-ID: `20261003T053651Z-source-management`  
Work-Unit-ID: `source-management-implementation`  
Attempt-ID: `implementation-1`  
Source-Revision: `c7e5c65fcf7d880c8eae686d4221053085ca692f`  
Build-Revision: `none`  
Launch-SHA256: `73bc43d7d1edafde492e27e39ac0b927cf771c3bef9b1c6a295a5cacf8b3d835`

Independent validation preceded implementation. Repeated mechanical ROUTE returned **S / exit 0**; substantive profile remains **M**, under `compact-quality-first-v2`.

| AC | Delivered | Remaining |
|---|---|---|
| SRC-01 | Authenticated DELETE, exact atomic 409, explicit child removal and rollback | Real PG execution |
| SRC-02 | Idempotent recrawl202, fresh defaults, source/files/documents/chunks preserved | Worker/PG hash-reuse verification |
| SRC-03 | Deterministic latest task; progress, confirmation, recrawl and safe failure states | Browser1440/390 |
| SRC-04 | Tenant-only two-number statistics; strict7day cutoff; published display and Add source action | PG cutoff and browser verification |
| SRC-05 | Startup/daily retention, strict cutoffs, bounded backlog continuation, non-overlap and awaited shutdown | PG boundaries and runtime |
| SRC-06 | 16 real PG scenarios authored; local critical Origin mutation passed RED→restore→GREEN | PG tests and deletion-guard mutation |
| SRC-07 | Exact immutable source/test hash map and completion handoff | Full regression, production build, Docker/UI, cleanup and independent review |

Deletion locks the source with `FOR NO KEY UPDATE`; enqueue/recrawl use `FOR UPDATE`. This serializes supported job creation while permitting the worker’s FK checks. `DELETE index_job … RETURNING state` locks retry contenders using existing privileges; any live state causes complete rollback. No schema or grant changes were needed.

Changed source/test/script files—23 total, all below500lines:

```text
packages/db/src/{source-management,jobs,index}.ts
packages/db/tests/int/source-management.test.ts
apps/web/src/server/{source-management-handler,runtime}.ts
apps/web/src/app/api/sources/[id]/route.ts
apps/web/src/app/api/sources/[id]/recrawl/route.ts
apps/web/src/app/api/bots/[id]/stats/route.ts
apps/web/src/app/cabinet/{source-actions,bot-stats,page,add-source}.tsx
apps/web/src/app/globals.css
apps/web/tests/unit/{source-management-handler,source-management-ui}.test.ts
services/worker/src/{retention,loop}.ts
services/worker/tests/int/{source-management,retention}.test.ts
services/worker/tests/unit/{retention,source-management-loop}.test.ts
scripts/mutate-source-management-guard.mjs
```

Actual checks:

- Focused units: **31passed / 6files**, exit0; reported duration2.44s.
- Root and web typecheck: **passed**, exit0.
- Origin mutation: baseline1passed → mutation1failed → byte-exact restoration →1passed; runner exit0. Restored file SHA256: `2a37b7b54482f6a8acd205836827fa6f13bea6aea53f1e827c928c748122e79a`.
- `git diff --check`: exit0.
- Snapshot verification: **23/23 hashes match**, with exact changed-file coverage.
- Initial focused failure was a test matcher inspecting the trap-pool Proxy; the fixture was corrected and subsequent checks passed.

Snapshot: [implementation-source-hashes.json](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-source-management/projects/06b-rag-class/tests/artifacts/source-management/implementation-source-hashes.json)  
Snapshot-file SHA256: `70471b359546817533f6bd3bddb40f735b93fed4994895e22d5975e3c28b0245`  
Method: SHA256 of raw file bytes; sorted project-relative path map; UTF-8 JSON with final LF. No source edits followed the snapshot.

Full completion evidence: [05_completion.md](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-source-management/projects/06b-rag-class/docs/features/source-management/05_completion.md). CLI terminal receipt destination:

```text
/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-source-management/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T053651Z-source-management/evidence/implementation-1-receipt.md
```

Coordinator next steps: execute authored PG tests and default mutation runner, complete full regression/build, perform source-bound E2E preflight and Docker UI1440/390 with cleanup, then obtain fresh independent review. Worker reuse tests explicitly use extractor fixtures and a fake provider.

No children, Docker/network/ports, paid calls, dependency/manifest/global-config changes, commits or pushes were performed. Requested model/effort: `gpt-6.1-sol/high`; exact actual host model/effort and usage counters were not exposed. Tokens, cost and active time: `null`; no fallback invoked. Elapsed to snapshot: **1139.983s**; final verification at `2026-10-03T06:01:15Z`, within1500s. Coordinator owns remaining work and telemetry; no external blocker found.

Status: completed