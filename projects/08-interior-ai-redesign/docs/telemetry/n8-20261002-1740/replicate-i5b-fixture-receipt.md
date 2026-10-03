# Migration-count fixture correction

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-replicate-i5b-fixture
ATTEMPT_ID: replicate-i5b-fixture-1
Source-Revision: 37dfe48b49bddfd1ebc7fdd95f38b314ca2aa33f
Build-Revision: null (test-only correction)
Launch-Path: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i5b-fixture-launch.json
Launch-SHA256: 65ee90bd45dfcec281c2a8067bc57944eb9ea8bdb05fc488adf18eeddc420e97
Trace-Path: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i5b-fixture-receipt.md
Started-At: 2026-10-03T12:03:36.985048+00:00 (launch timestamp; elapsed includes launch-to-execution gap)
Finished-At: 2026-10-03T12:05:03.058953+00:00
Duration-Seconds: 86.074 (wall clock since launch)
Profile: tiny test-only correction; T forced by coordinator, sole executor, requested gpt-6.1-sol/high; no fallback/delegation.
Actual-Model: null
Usage: null
Cost: null
Measurement-Gaps: provider-resolved model, tokens and cost are unavailable; requested model is not runtime proof.

Changed only tests/sharing.integration.test.js:29, exact strict migration count 6→8. Every other byte matches source. Recorded PG16 failure has actual 8 / expected 6; source db/001..008 and the eight-entry scripts/migrate.js list were verified once. Production unchanged.
Old-Test-SHA256: 13183543b3921b2a5b686168c0833443b479eca14f5b5466f731f7fe3244b811
Test-SHA256: ee78b5ef16d5cf187a9774e07cb7b4d6c53bff73c9323c30326c6355351779bf
Snapshot-Path: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i5b-fixture-snapshot.json
Snapshot-SHA256: afa65cf025282654d674057ba2571449993fe8548982b83bc44b44702f860ad8

Checks: /tmp/n8-node22 --check tests/sharing.integration.test.js exit 0; git diff --check exit 0; exact one-line diff and single-byte replacement pass; source revision/launch digest pass; all seven protected I5b product/test hashes match replicate-i5b-snapshot.json before and after correction. Tracked diff contains only the authorized test.
Preflight: not_applicable (no E2E or PG execution in this bounded correction).
PG: pending parent affected sharing PG16 run. Fresh different Astra review pending parent. I5b acceptance not declared.
Verdict: pass for the authorized literal correction and local mechanical checks only.
Status: completed
