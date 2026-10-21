R1 and the retention fixture are corrected. Bounded author work completed; PostgreSQL runtime verification and feature acceptance remain pending.

Run-ID: `20261003T053651Z-source-management`  
Work-Unit-ID: `source-management-correction`  
Attempt-ID: `correction-1`  
Source-Revision: `41d6dedfd027f698ae4d79aa1b61a066d22ced32`, with correction snapshot  
Build-Revision: `null`  
Launch-SHA256: `1956159b279c1e42ce76046d730fd8498fe3d9f0215b4d4581e1532bed76940e`  
Finished-At: `2026-10-03T06:21:58.293005+00:00`  
Measured elapsed: **508.623 seconds**, within 720 seconds.

Exact changed source/test files:

- `packages/db/src/source-management.ts`: early live-job rejection under source `FOR NO KEY UPDATE`; post-lock `RETURNING` guard retained.
- `packages/db/tests/int/source-management.test.ts`: deterministic live+failed retry regression and adjusted worker-FK barrier.
- `services/worker/tests/int/retention.test.ts`: `$2::integer` fixture cast.
- `scripts/mutate-source-management-guard.mjs`: `--live-retry` oracle; default mutation now exercises the failed-only retry race.

The R1 fixture verifies L-before-F scan order, DELETE’s actual wait on F, and its lock on L. Its fixed assertion requires DELETE=409 and retry=`source-busy`. The mutation requires a verified lock-boundary marker plus 503/40P01, followed by byte-exact restoration and GREEN.

Executed checks:

- Root/web typecheck: exit 0.
- Focused units: **18 passed / 4 files**, exit 0.
- Final root typecheck: exit 0.
- Mutation script syntax and `git diff --check`: exit 0.
- Static old-code reconstruction and file-size checks: passed.
- All **23 final raw-file hashes** verified.

Report: `docs/features/source-management/09_correction.md`. New evidence under `tests/artifacts/source-management/`:

- `correction-typecheck.txt`
- `correction-final-root-typecheck.txt`
- `correction-focused-tests.txt`
- `correction-static-checks.txt`
- `correction-checks.json`
- `final-source-hashes.json`

Snapshot-SHA256: `2aa1bd4b8d2585254ff21b793a40d71fbcdca5d4bdb89a0fe81eb00a3ec2c978`  
Checks-SHA256: `072b646d9c6da32ef121bba752bee8ecdbb585943b2e08e9ea1f69b6724064c8`

Coordinator-owned runtime checks remain required: `--live-retry` GREEN→meaningful RED→restore→GREEN, default post-lock mutation, affected PostgreSQL concurrency/FK/retention tests, and mandatory final regression/build/UI/review. **Dynamic R1 proof was not executed here; no runtime acceptance is claimed.**

Profile: `compact-quality-first-v2`; requested `gpt-6.1-sol/high`. Actual model/effort, tokens, cost and active-time counters are unavailable. Telemetry remains under `docs/telemetry/p-replicator/20261003T053651Z-source-management/`; this CLI receipt targets `evidence/correction-1-receipt.md`.

No donors, children, Docker, network, ports, dependency/schema/grant changes, commit or push. Initial artifacts were preserved. No background work remains in this attempt.

Status: completed