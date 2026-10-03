# F15 correction-1: exact R1 and retention fixture

Run-ID: 20261003T053651Z-source-management
Work-Unit-ID: source-management-correction
Attempt-ID: correction-1
Source-Revision: 41d6dedfd027f698ae4d79aa1b61a066d22ced32 (dirty correction snapshot)
Build-Revision: null; no build produced by this attempt.
Launch-SHA256: 1956159b279c1e42ce76046d730fd8498fe3d9f0215b4d4581e1532bed76940e
Launch: docs/telemetry/p-replicator/20261003T053651Z-source-management/evidence/correction-1-launch.json
Final CLI receipt destination: docs/telemetry/p-replicator/20261003T053651Z-source-management/evidence/correction-1-receipt.md

## Scope and reasoning

Read the correction brief, root/project instructions, 08_review, 01_plan and 02_validation.
Existing run/launch was recorded before this correction; coordinator owns telemetry mutations.
Repeated mechanical ROUTE: explicit source-management.ts and retention fixture, S/exit0.
Substantive route remains M: deletion, tenant privileges, row/unique-index races and retention boundaries.
Profile compact-quality-first-v2; requested gpt-6.1-sol/high. Exact actual model/effort and
usage/cost are unavailable inside this attempt; no fallback or child was launched.
Applied local project-work-companion handoff instructions. E2E preflight: not_applicable,
because real PostgreSQL, Docker and browser execution are outside this author's allowed scope.

R1 source-level reasoning: R already holds historical failed F; D deletes live L then waits on F;
R's failed-to-queued UPDATE checks the partial unique index and waits on D's uncommitted L deletion.
That creates a transaction lock cycle; either participant can be the deadlock victim. D's
HTTP503 or R's 40P01 violates the fixed domain result. This remains source-level reasoning
until the coordinator executes the dynamic oracle below; no new runtime proof is claimed here.

Minimal fix: after taking source FOR NO KEY UPDATE, reject visible queued/running work before
the bulk job DELETE. D therefore does not tentatively delete L in the described state. The
source lock still serializes supported enqueue/recrawl and permits worker FK KEY SHARE.
The early read is not the safety oracle: a failed-only source can be retried after the read,
so DELETE RETURNING state and its transactional rollback guard remain mandatory and unchanged.
No tenant job UPDATE authority or migration/grant change is introduced.

Retention fixture: add only $2::integer to the date subtraction. PostgreSQL's overloaded
date-minus-date inference had produced an integer expression for the day column. Production
retention SQL is unchanged; strict cutoff assertions remain intact.

## Exact changed source/test files

- packages/db/src/source-management.ts: early live rejection under the existing source lock.
- packages/db/tests/int/source-management.test.ts: one new two-job real-PG regression, plus
  adjustment of the worker-FK barrier to hold D after source lock, before the early check.
- services/worker/tests/int/retention.test.ts: explicit integer fixture parameter cast.
- scripts/mutate-source-management-guard.mjs: --live-retry mutation and fixed R1 oracle;
  default post-lock mutation selects the existing failed-only retry race so the early check
  cannot mask removal of the RETURNING guard. --origin behavior is unchanged.

The two-job fixture inserts L then F, asserts physical ctid order, forces a sequential scan
from block zero (indexes/bitmap/parallel/synchronized scans disabled only in D's transaction),
and verifies EXPLAIN's actual child is Seq Scan. The owner fixture pre-locks F using the retry
function's initial SELECT predicate and FOR UPDATE mode. This recreates its precise lock
boundary without altering function/product SQL or granting tenant UPDATE. The same transaction
then switches to n6b_tenant and executes the real n6b_retry_job function.

With the old guard removed, pg_blocking_pids must show D waiting on that F transaction and
an independent FOR KEY SHARE NOWAIT probe on L must fail with55P03 before retry is released.
With the fix, D can finish409 immediately; retry sees committed live L and returns source-busy.
The fixed assertion requires both DELETE409 and retry source-busy, verifies the exact busy
body and preserves the complete data snapshot and both states. Both queued/running states
are exercised. Query waits have bounded5s observation/8s statement limits; finally rolls back
and releases R and waits for D, whose withTenant finally releases its own connection.

## Local checks executed

- npm run typecheck: exit0; root and web TypeScript passed. correction-typecheck.txt.
- Focused unit command: node node_modules/vitest/vitest.mjs run --config vitest.config.ts
  apps/web/tests/unit/source-management-handler.test.ts services/worker/tests/unit/retention.test.ts
  services/worker/tests/unit/source-management-loop.test.ts services/worker/tests/unit/job-guards.test.ts
  — exit0,18tests/4files,1.66s. correction-focused-tests.txt.
- Final root TypeScript after the last fixture SQL adjustment: exit0.
  correction-final-root-typecheck.txt.
- node --check scripts/mutate-source-management-guard.mjs and git diff --check: exit0.
- Static reconstruction: removing the mutation's early-query/throw block reconstructs HEAD's
  product bytes apart from the two explanatory comments; post-lock guard retained. All four
  changed source/test files remain under500lines. correction-static-checks.txt.

All evidence paths above are under tests/artifacts/source-management/. No unchanged full
regression/build was repeated. Earlier646unit/308otherPG/build results are historical coordinator
evidence, not passes against this correction's snapshot.

## Coordinator-owned runtime gates (pending; acceptance blocked until executed)

In the existing authorized internal PG environment, with the final snapshot mounted/copied:

1. node scripts/mutate-source-management-guard.mjs --live-retry
   — requires baseline1pass, RED1failure with observed lock-boundary marker and503/40P01,
   byte-exact restore SHA, then restored1pass. Infrastructure failure is rejected as R1 evidence.
2. node scripts/mutate-source-management-guard.mjs
   — requires failed-only retry oracle GREEN, post-lock guard removal RED, byte restore GREEN.
3. node node_modules/vitest/vitest.mjs run --config vitest.int.config.ts
   packages/db/tests/int/source-management.test.ts services/worker/tests/int/retention.test.ts
   services/worker/tests/int/source-management.test.ts --reporter=verbose
   — affected PG concurrency, worker-FK compatibility and retention boundaries.
4. Coordinator's mandatory final regression/build/UI and independent correction review.
   The full-summary artifact-directory permission issue remains coordinator-owned.

Author completion does not accept SRC-06/07 or the feature. No running background task is claimed.
Coordinator is responsible for actual execution and continuation; no acceptance is inferred from
launch or from this report. No donors, children, Docker, network, ports, dependencies, schema,
grants, commit or push were used. Initial artifacts and implementation snapshot were preserved.

Final raw-byte snapshot: tests/artifacts/source-management/final-source-hashes.json contains all
23original paths, correction identity and source revision. No new test file was needed.
Available token/cost/active-time measurements: null; elapsed is recorded in the final receipt.
No savings claim or estimate of unknown counters is made.
