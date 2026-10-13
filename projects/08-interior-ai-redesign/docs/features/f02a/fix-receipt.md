Bounded correction completed; F02a runtime acceptance remains pending with the coordinator.

- RUN_ID: `n8-20261002-1740`
- WORK_UNIT_ID: `n8-f02a-fix`
- ATTEMPT_ID: `n8-f02a-fix-attempt-1`
- Source-Revision: `d3b202404886d56ca3d46f0d8deb423d4858ed06` (HEAD verified unchanged)
- Launch-SHA256: `c3ef97af87e04e73d12c980362f9f336618f2aa0b858198215e524ffc7e62b93` (supplied launch file verified)
- Build-Revision: `215646b5d9541299408119dd357d84d3df8ac96d6490daf2a20d674a2768daaa` (canonical 32-file source snapshot, not a container image)
- Product-Diff-SHA256: `c96fb02395df32e74bd95972d92c1a8312166e42d00727169e2c097f1ffe6a62`
- Started-At: `2026-10-02T21:17:09.117136+00:00` (launcher timestamp; includes instruction reading)
- Finished-At: `2026-10-02T21:24:12.081574+00:00`
- Elapsed-Wall-Ms: `422964`
- Verdict: bounded implementation and lightweight checks PASS; PostgreSQL/product acceptance PENDING.

Changed product files, relative to PROJECT_ROOT `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f02a-fix/projects/08-interior-ai-redesign`:

1. `tests/jobs.integration.test.js`: reset truncates both account-dependent state and `attempt_budget` inside the isolated schema. Added real-repository JOB-04 coverage with an intentionally inconsistent `reserved=true` queued job lacking a reserve ledger entry. Actual `get`, maintenance and deletion operations must leave release count zero and balance unchanged. The paired normally reserved job must release exactly once and restore its original balance. Existing concurrent/stale exactly-once checks remain. Added completion/readback of persisted sd/controlnet/depth revisions with supplied throwing `toJSON`.
2. `web/jobs.js`: supplied clock requires explicit test runtime and a function; development, production and missing runtime reject injection. Validation returns a detached canonical object containing three required own string revisions. Arrays, custom-prototype and unsupported shapes reject. Completion persists this validated copy, never the original object's serializer. The existing reserve-existence and unique-release financial guards required no change.
3. `tests/jobs.test.js`: covers test-only clock success, development/production/missing-runtime rejection, invalid clock types, unsupported provenance forms, missing/invalid revision values, null-prototype plain objects, detached serialization and hostile `toJSON`.

Executed from PROJECT_ROOT with `/tmp/n6b-f06-node22/bin/node` v22.22.3; each command below uses that exact executable prefix:

| Arguments | Exit | Result |
|---|---:|---|
| `scripts/check.js` | 0 | Project build script: all web/scripts/tests JS syntax checked |
| `tests/boundaries.test.js` | 0 | 7 passed |
| `tests/media.test.js` | 0 | 5 passed |
| `tests/jobs.test.js` | 0 | 5 passed |
| `tests/mutation.test.js` | 0 | 3 passed; harness evidence only |
| `scripts/mutation.js origin` | 0 | Baseline exit0; targeted mutant exit1 |
| `--test-name-pattern=Trusted clock tests/jobs.test.js` on temporary clock mutant | 1 | Expected assertion failure; guard detected |
| `--test-name-pattern=Provenance rejects tests/jobs.test.js` on temporary shape mutant | 1 | Expected assertion failure; guard detected |
| Same provenance command on temporary copy mutant | 1 | Expected assertion failure; guard detected |

Both `bash scripts/complexity-router.sh` invocations listed the three owned product paths: exit0, mechanical S; substantive XL retained for existing credit/account invariants. Owner's bounded correction authorization applies. Product `git diff --check -- projects/08-interior-ai-redesign`: exit0. Snapshot generation/verification: Python SHA256 over UTF-8 canonical `{files:[{path,sha256}]}`, sorted keys and comma/colon separators, files sorted by path: exit0; 32/32 recorded, exactly these three product hashes differ from immutable prior snapshot `4ac13c0d0b854f2cb5423bd1eede26dd595dac265524c97bcdab104a5cc2c75a`.

Failures retained: initial temporary mutation commands included `--test`; each exited1 with only wrapper `ERR_TEST_FAILURE`, so none counted as detection. They were retried in the repository's direct Node mode and failed at the expected assertions; initial logs and commands remain in `fix-guard-initial-checks.json`. Read-only historical coordinator logs report jobsPG 11pass/8fail including parent, with retained budget counts; budget mutation exited1 because baseline failed. Those historical failures are not represented as corrected runtime passes.

Evidence under `docs/features/f02a/`: `fix-attempt.json`, `fix-events.jsonl`, `fix-checks.json`, `fix-guard-checks.json`, `fix-guard-initial-checks.json`, `fix-build-snapshot.json`, `fix-receipt.md`, plus per-command logs. `fix-scope-check.json` enumerates every exact owned evidence path. Immutable prior review/receipts/metadata are untouched. TRACE remains absent for coordinator installation of this substantive payload at `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f02a-fix/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f02a-fix-receipt.md`.

Profile `compact-quality-first-v2`; requested model `gpt-6.1-sol`, high. Actual model, actual effort, runtime model evidence, usage and cost: null; host/provider metadata unavailable, no inference from requested routing. No delegation, model switch or fallback. Active-time accounting null; elapsed is measured from launch metadata through this handoff observation.

Pending coordinator checks: F01 PostgreSQL suite; complete corrected F02a PostgreSQL suite including no-reserve and persisted-provenance cases; real budget and owner mutations; source-bound Docker regression after N6 releases mutex; fresh independent review of these corrections. No Docker, network/provider, deployment, GPU/weights/spend, secrets inspection or git mutation performed. Companion E2E preflight not_applicable: internal-contract correction, no browser E2E in this unit. Synthetic fixtures establish software contracts only; F02b actual bytes/inference and real GPU geometry/performance remain pending.

Status: completed
