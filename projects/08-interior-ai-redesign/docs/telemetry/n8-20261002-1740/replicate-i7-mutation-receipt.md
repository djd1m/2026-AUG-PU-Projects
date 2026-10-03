# I7 fixture mutation correction receipt

WORK_UNIT_ID: n8-replicate-i7-mutation
RUN_ID: n8-20261002-1740
Source-Revision: d562842454a5e4bfa7d7af0c1d7c27cf1fa31d7e
Launch: /tmp/n8-replicate-i7-mutation/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i7-mutation-launch.json
Launch-SHA256: 331ec20dbb7f118b102393930a156e102f649d57d6f01d9c7431203eac5b02c8
TRACE_PATH: /tmp/n8-replicate-i7-mutation/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i7-mutation-receipt.md
Finished-At: 2026-10-03T16:31:27.453277+00:00
Verdict: pass (bounded correction author AC; whole-feature acceptance parent-owned)

Only scripts/mutation.js fixture-kind branch and tests/mutation.test.js changed
tracked bytes. The feature note and unique replicate-i7-mutation evidence are
within scope. Production web/quality.js, tests/quality.test.js and every other
protected tracked file are identical to the initial snapshot: 2136
protected files checked. No commit/push or forbidden external action occurred.

Historical evidence is retained unchanged at replicate-i7-fixture-diagnostic:
baseline exit0; mutant exit1 threw quality_mode_invalid before GEOM-03 and was
inconclusive. state.json links all three historical artifacts by SHA-256.

Concrete control flow and correction: review validates evidence, then
requireRealQuality rejects fixture explicitly and again through supportedRealMode.
The same function is called under final account/job locks. The disposable mutant
removes the first rejection and exempts only fixture from the second; other invalid
modes remain denied. Each complete original statement must occur exactly once;
missing/duplicate/already-mutated guards fail before source writes. No additional
validator was bypassed. All provenance/byte/config/corpus validations are retained.
The existing mutationDetected recognizer and quality oracle are unchanged.

Checks (actual Node v22.20.0, /tmp/n8-node22):

- Existing tests/quality.test.js: baseline exit0 / 7 pass; mutant exit1 at exact
  GEOM-03 fixture quality must be rejected with otherwise valid provenance,
  ERR_ASSERTION, expected true / actual false / strictEqual; five other leaves
  pass. Parent TAP failure also counted. Explicit restore exit0 / 7 pass.
- Production SHA256 before/restored/after: 53df3db86de19df36f5ae573b797f9a1f2a94f21e3e36dec46fee1710e69f24c
- Oracle SHA256 before/restored/after: baa3049a249b8185515ef5ef0b3204b17141a67de745ba237aaba4e3997b9278
- Disposable mutant SHA256: 08bb1d112122f133d08b70a8c9073df56bae9342f8eabd0a933ff99efcabfd04
- Mutation units: exit0 / 10 pass, including both guards' exact-count mismatch,
  reapplication, invalid-mode refusal and recognizer/infrastructure negative probes.
- Static build (scripts/check.js): exit0. git diff --check: exit0.
- Protected byte and path allowlist check: pass, no violations.

Measured proof used existing verifyMutation/runTest/mutationDetected in a disposable
copy, preserving baseline.log and mutation.log. Explicit source restore then
runTest produced restored.log; copied oracle and real production/oracle hashes
matched. Disposable copy removed. No new runner orchestration was installed.

Outputs in replicate-i7-mutation-evidence/:

- baseline.log, mutation.log, restored.log: complete raw quality TAP.
- quality-proof.json: measured 0/1/0, source/oracle/runner/log hashes and restoration.
- mutation-units.log and mutation-units.json: raw units and command/exit binding.
- build.log/build.json, diff-check.log/diff-check.json: raw check output and exits.
- initial-hashes.json, scope-check.json: protected tracked bytes and path check.
- candidate.diff: exact scoped patch; SHA256 6efe2b3ff6a3b3a208852c746267edcfdfd1792a8b418a39764f994d1d468fe6.
- state.json: source/spec/architecture/policy-route context, launch binding,
  initial failing history, checks, stage boundaries, measurement gaps and handoff.
- artifact-hashes.json: immutable output digests, including state and feature binding.

Report: /tmp/n8-replicate-i7-mutation/projects/08-interior-ai-redesign/docs/features/f07-replicate/i7-mutation-fix.md
Evidence: /tmp/n8-replicate-i7-mutation/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i7-mutation-evidence

Profile: compact-quality-first-v2; mechanical S/exit0, substantive bounded S
correction within inherited approved XL. Sole requested Sol6.1/high author;
actual_model=null, actual_effort=null, usage=null, cost=null pending host metadata.
No fallback or delegation. Companion prepare/handoff applied; E2E preflight
not_applicable because only local runner/quality checks were performed.
Elapsed from source-bound parent launch through freeze: 437.604s;
active time null (no host interval accounting). Parent HARD600/freeze540 respected.
Historical 480 local/163 PG/5 Python, eight other mutations and I6a were supplied
accepted evidence, not repeated or represented as new PASS. Parent owns independent
review, integration and whole-feature completion; this unit's required AC are met.
No production/oracle changes, Docker/network/secrets/provider spend/installs.

Status: completed
