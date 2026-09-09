# Serial foundation verification

Candidate: `91e3b2d` plus `final-source-snapshot.json`; no source mutations between snapshot and run.
Command: `node scripts/run-foundation-integration.mjs`
Observed terminal exit: 0. Namespace: `n3a-foundation-d8cc9d20e2d8`.
Typecheck/build/infra/port checks: passed. Migrations: 2 applied.
Unit: 5 files, 9 passed. Integration: 6 files, 13 passed.
Original source restored after seven detected mutations (separate persisted artifact).
Own test stack stopped; volume retained. No production deployment or donor changes.
Standalone `npm audit --json`: exit0, total vulnerabilities0.
Native Argon2 observation: Node22.22.0,757ms,maxRSS191676KiB; not an SLO.
Terminal output for preceding mutation harness was lost; no exit code is invented for that invocation. The saved mutation artifact and this new serial run are separate evidence.


## Startup correction verification

2026-09-09: `node scripts/run-foundation-integration.mjs --mutations` exit0; namespace n3a-foundation-8d9f0eececa5. Typecheck/build/infra/ports passed,10unit/13integration passed,8mutations detected including runtime startup config removal; original source untouched and schema restored. Scope includes all four declared serve commands. Image build/start remains pending in the following run.

Status: completed
