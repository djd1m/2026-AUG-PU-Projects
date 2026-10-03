Run-ID: 20261003T064351Z-release-gate  
Work-Unit-ID: release-gate-pg-validation  
Attempt-ID: pg-validation-1  
Source-Revision: e5672838a107c2cafc616600a4cb00de7d5895b8  
Build-Revision: null — cached image with explicit source/test overlays  
Launch-SHA256: 05d5672afc1982738f6fa320936240a11b52c5cd0f71acfd011a90a4b68837d1  
Finished-At: 2026-10-03T07:31:48.275558+00:00  
Verdict: pass — narrow realPG validation only

The exported `createFixture`, `prepareCorpus`, `seedCorpus`, and `readEvidence` ran against real PostgreSQL 16.15 / pgvector 0.8.6 using existing migrations and service roles. The gateway used `FakeProvider`; SQL was real and no live provider calls occurred.

Passed: **3/3 integration tests**, package export builds via `npm run pretest`, and root TypeScript check. Final runner and cleanup exit codes were 0.

Assertions verified service-role writes, `is_test=true`, ten exact documents/chunks with hashes and 1536-dimensional embeddings, real vector search excluding populated foreign-tenant data, and populated ledger/question/quota evidence scoped to the account and bot. Token sums were checked; incomplete usage and actual billing cost remained null. Global quota rows retain the helper’s concurrency caveat.

Runtime image: `sha256:ff0c8692df9cfbaeae0d176d4c9de9a28cadb7fd9d5e9dae2725e99ee2fcb65f`  
Source snapshot SHA256: `2c73e18a2e6099c0d613c22a3710b6abbf3951e84656896faf4c776ba66a797a`  
Live-store SHA256: `ec4e86139b3c1be5df27c170ea9317d359b13986160a808051a8307c4ae9676f`  
New-test SHA256: `319d115324898978fe19d3585dce9072a10f1dfaf070f3b7837e8000b9250aca`

The container verified 65 source hashes; all still matched after execution. Image, mount, CPU and port bindings are recorded.

Three invocations were needed. The first failed typecheck because two F16 script overlays were missing. The second passed two tests and failed on my invalid sibling public-ID fixture. Both failures are preserved as `pg-pass1-*` and `pg-pass2-*`. The corrected third invocation passed. No product helper defect was found.

Final mutex interval: **07:29:34–07:30:18 UTC**; earlier intervals are preserved. Each isolated stack used DB 1 + runner 1 CPU, an internal network and no published ports. All three stacks and private env directories were removed; final container/network/volume absence was checked. No product, schema, dependency or manifest edits, image rebuild, commits or pushes.

Profile: `compact-quality-first-v2`. Requested model/effort: `gpt-6.1-sol / high`; actual model/effort and usage/cost are unknown because host measurements were not exposed. Recorded elapsed time: **502.816 seconds**, including reading, corrections, waits and receipt preparation. Active time is unknown. No children were launched.

Files:

- [Regression test](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/packages/rag/tests/int/release-gate.int.test.ts)
- [Validation note](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/features/release-gate/09_pg-validation.md)
- [Execution log](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/tests/artifacts/release-gate/pg-validation.txt)
- [Verification and telemetry evidence](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/tests/artifacts/release-gate/pg-verification.json)
- [Final receipt](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T064351Z-release-gate/evidence/pg-validation-1-receipt.md)

Reproduce: `bash tests/artifacts/release-gate/pg-runner.sh "$PWD"` from the project root. Parent telemetry integration remains coordinator-owned.

No remaining work within this narrow validation scope. The unchanged full suite was not repeated. Live calibration, stand/browser/CJM/rollback validation and independent source review remain separate gates; release readiness is not established.

Status: completed