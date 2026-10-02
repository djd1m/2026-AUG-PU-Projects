Bounded correction completed. **F02a PostgreSQL acceptance remains pending.** The substantive receipt is saved in [fix-receipt.md](projects/08-interior-ai-redesign/docs/features/f02a/fix-receipt.md); the coordinator’s TRACE remains absent for installation.

- RUN_ID: `n8-20261002-1740`
- WORK_UNIT_ID: `n8-f02a-fix`
- ATTEMPT_ID: `n8-f02a-fix-attempt-1`
- Source-Revision: `d3b202404886d56ca3d46f0d8deb423d4858ed06`
- Launch-SHA256: `c3ef97af87e04e73d12c980362f9f336618f2aa0b858198215e524ffc7e62b93`
- Build-Revision: `215646b5d9541299408119dd357d84d3df8ac96d6490daf2a20d674a2768daaa`

Only three product files changed:

- `tests/jobs.integration.test.js`: reset now clears `attempt_budget`. Added actual repository-operation coverage proving absent reserve must produce zero release credit, while a real reserve releases exactly once. Added PostgreSQL readback of all three persisted revisions with hostile `toJSON`.
- `web/jobs.js`: clock injection requires explicit test runtime. Completion persists a detached, validated canonical `sd/controlnet/depth` object; arrays and unsupported objects reject. Existing release logic required no change.
- `tests/jobs.test.js`: added clock boundary and provenance shape/serialization regressions.

All commands used `/tmp/n6b-f06-node22/bin/node` v22.22.3 from the project directory:

| Command arguments | Exit | Result |
|---|---:|---|
| `scripts/check.js` | 0 | Build/syntax passed |
| `tests/boundaries.test.js` | 0 | 7 passed |
| `tests/media.test.js` | 0 | 5 passed |
| `tests/jobs.test.js` | 0 | 5 passed |
| `tests/mutation.test.js` | 0 | 3 passed |
| `scripts/mutation.js origin` | 0 | Green baseline; targeted mutant detected |

Temporary clock, provenance-shape and provenance-copy mutations each produced the expected assertion failure. Their initial `--test` invocation yielded wrapper-only failures and was recorded as inconclusive; direct Node retries demonstrated detection.

The canonical snapshot records **32/32 file hashes**, with exactly the three owned product paths differing from the previous snapshot. Product `git diff --check` and the ownership scope check passed. Exact commands, logs, timestamps and paths are retained under `docs/features/f02a/fix-*`, including `fix-checks.json`, `fix-guard-checks.json`, `fix-build-snapshot.json` and `fix-scope-check.json`.

Historical PostgreSQL failures remain disclosed: 11 passed / 8 failed, including the parent; budget mutation failed its baseline. No corrected PostgreSQL pass is claimed. Pending coordinator work: both PostgreSQL suites, real budget/owner mutations, Docker regression and independent correction review. F02b and real GPU acceptance remain pending.

Profile: `compact-quality-first-v2`, substantive risk XL. Requested model: `gpt-6.1-sol`, high. Actual model/effort evidence, usage and cost: **null**, unavailable from the host. No delegation or model switch.

Measured launch-to-handoff interval: `2026-10-02T21:17:09.117136Z`–`2026-10-02T21:24:12.081574Z`, **422,964 ms**. No Docker, network, provider, deployment, GPU, spend or git mutation occurred.

Status: completed