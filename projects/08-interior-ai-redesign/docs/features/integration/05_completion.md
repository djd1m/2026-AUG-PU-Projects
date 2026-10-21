# integration — criterion coverage

The integration review has source-bound backend, benchmark, browser and restart evidence. This document maps every criterion exactly once to the best existing literal test title.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-integration-1 | scripts/benchmark.ts | SC-US-024-1 owned project reads with ten clients retain all1000 samples at p95 under500ms |
| AC-integration-2 | scripts/benchmark.ts | SC-US-024-2 200-line budget with an unknown element preserves literal totals and golden hash at p95 under100ms |
| AC-integration-3 | scripts/restart-check.mjs | SC-US-017-1 owned project revisions budgets and original asset hashes survive web and worker restart |
| AC-integration-4 | tests/integration/operations.test.ts | actual worker entrypoint refuses invalid configuration with only redacted startup reason |

## Evidence boundary

`final-benchmark-3.json` binds image 8 to 10 API clients, 200 warm-ups and 1000 retained measurements at p95 47.754862 ms; the pure 200-line path retained 1000/1000 matching hashes with one explicit unknown and p95 7.602620 ms. `restart-before-2.json` and `restart-after-2.json` match two projects, revisions, budgets and original asset hashes across web/worker restart with ready HTTP 200; private ports stayed healthy and the database was not recreated. `final-source-image-1.json` matches 148 runtime files to `docker:sha256:e5be7120110b92ed9b15b163638e65e339c796b16a0b567e166f53e11d8d8d21`; the same image passed the 21-check journey. `AC-integration-4` retains the affected worker/config tests and runtime readiness evidence.
