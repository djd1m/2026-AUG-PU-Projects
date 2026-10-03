# I8 hold correction author receipt

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-replicate-i8-hold
Attempt: sole-author-1
Source-Revision: c0bd24c84e96049f29e64539972eb31cd25f64a2
Build-Revision: null (author static syntax only; parent owns actual build/runtime)
Launch-SHA256: b0b48a4816665c881b6a9ed1eac6f1da6a0cbd1d7a146eab2447ceb860ad3ea6
Source-Snapshot-SHA256: bf4d9933db4d20ec62037a8c4bbb50711380eb531bc318090102276bf8051537
Finished-At: 2026-10-03T17:16:08.444289+00:00
Verdict: narrow author correction complete; full feature/I8 acceptance pending

Corrected the harness's two illegal hold resets without changing application or PostgreSQL guards. `replicate-cases.js` now executes missing-config and held-response deletion before a permanent hold. Both actual DOM reservations are made while the existing viewport owner is active. `heldPair` starts the older job and gates its actual mock POST after committed real authorization, claims the other job while active, then commits hold in that flight's beforeRun. The second flight refuses with zero HTTP and one customer release; the first completes privately under its original authorization. Gate release precedes paced DOM checks to respect the unchanged five-second HTTP deadline. Finally releases, cancels and joins both flights. Account hold remains true; normal logout remains allowed.

Exact five named hosted checks are unchanged at both 1440/390; main52 + disabled2 are expected, not claimed passed. Private/unverified/publish-disabled/POST404 assertions remain and after-flight numeric calls are strengthened to one POST/one GET/two delivery calls. R1 DELETE200 + handler done + GET404 before gate release, cleanup/no evidence/no new artifact/release once; R2 canonical JSONB stored hash; R3 actual main owner ID/email plus registration/reservation accounting remain. Five HTTP registrations total and 13 unique reservations per main owner under unchanged 20/day (platform200/day) remain. No new accounts or synthetic DB acceptance/evidence insertion.

Checks on `/tmp/n8-node22` and the supplied existing dependency symlink:

- Focused `--test --test-concurrency=2` on `tests/ui-replicate-{hold,corrections,registration,fixture,publication}.test.js`: exit0, 23 passed, zero failed/skipped. Seven new behavioral regressions execute the actual extracted scheduling helper with existing programmable transport/gate seams, including both viewport calls and bounded cleanup failures/expiry. Existing relevant16 remain green. Raw final log: `replicate-i8-hold-tests-restored-green.log`.
- Original source finally reproduction raises `monotonic billing state`; original actualPG failure log with protect_billing_state, source and build artifacts remain byte-preserved. The reproduction is programmable local proof, not a new PG/browser run.
- Targeted actual-helper mutation `await hold(false)` made unchanged 1440 scheduling oracle exit1 (`monotonic billing state`). Candidate restored byte-for-byte; focused23 restored green. Raw red log and immutable candidate/mutant/restored/oracle hashes: `replicate-i8-hold-mutation-red.log`, `replicate-i8-hold-mutation.json`.
- `/tmp/n8-node22 scripts/check.js`: exit0 ESM/static build syntax. Raw `replicate-i8-hold-build.log`. `git diff --check`: exit0.
- SHA-256 snapshots protect 2189 tracked files outside the explicit allowlist; zero drift. Scope guard has no unexpected tracked/untracked edits. Unchanged fixture/browser/registration, production/SQL/oracles/canonical docs/toolkit/packages and original failure evidence are covered. Initial/final protected snapshots, exact named-check equality, source/spec/architecture/launch hashes and dirty patch are saved with this prefix.

Changed files: `scripts/ui/replicate-cases.js`; `tests/ui-replicate-corrections.test.js` (only extracted privateCompletion endpoint); new `tests/ui-replicate-hold.test.js`; `docs/features/f07-replicate/i8-hold-correction.md`; unique `replicate-i8-hold-*` telemetry. No commit/push. No Docker/browser/DB/network/install/cache/secrets/provider/root-cleanup action executed. Existing480 local/163PG/5Python and I7 mutation evidence is unchanged and not broadly repeated.

Profile: compact-quality-first-v2, caller override sole narrow Sol6.1/high author. Requested model/effort: gpt-6.1-sol/high. Actual model/effort/usage/cost: null, pending host metadata. No delegation, model switch or fallback. Measured elapsed: 758127ms (758.127s) from caller launch, including reading/checks/reporting; active time null because wait intervals are not measured. No savings claim. The initial focused-test invocation used the repo cwd and found no tests; the corrected project-cwd invocation and final restored run passed. This command error was not hidden as a pass.

Handoff evidence index: `/tmp/n8-replicate-i8-hold/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i8-hold-checks.json` and `/tmp/n8-replicate-i8-hold/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i8-hold-work.json`. Report: `/tmp/n8-replicate-i8-hold/projects/08-interior-ai-redesign/docs/features/f07-replicate/i8-hold-correction.md`. All accepted author-scope work is complete. Parent remains responsible for fresh independent Astra review of these candidate hashes, then immediate companion source/build/environment preflight and actual main52 + disabled2 browser execution. Runtime acceptance, provider quality/performance/cost and full feature verdict remain pending; this receipt cannot replace those gates.

Status: completed
