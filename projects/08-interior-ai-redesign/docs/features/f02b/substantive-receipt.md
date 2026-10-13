# N8 F02b bounded coding receipt

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-f02b
ATTEMPT_ID: n8-f02b-attempt-1
Source-Revision: c345ec1ef57517acfca731b27254be5249aabd52
Launch-SHA256: 542328c4ab3f3b8f33ac8560633ccfc5d4be067ab20f5a11d4137c5bfd4ccb4a
Build-Revision: 362e3cedb6b2b31b09d80606d51fc11d958ad14ed3c0876ecbc0ec4d2ab29413
Finished-At: 2026-10-02T22:00:34.558299+00:00
Verdict: bounded implementation completed; NOT accepted delivery. Required PostgreSQL/build/review/security gates pending; real GPU geometry/performance unknown.

Profile: compact-quality-first-v2, substantive XL. Mechanical router exit0/S is only a lower bound; private data/evidence/credit release preserve XL. Accepted F02/F02b plan reused, no new financial invariant. Requested gpt-6.1-sol/high; actual_model=null, actual_effort=null (no host execution metadata). No delegation or global model/config changes. Usage/cost=null; cost basis unavailable; no savings claim.

Elapsed wall: 1404290ms (23.40min) from immutable launch timestamp, including reading/code/testing/receipt, within25min. Active wall=null because intervals were not measured. No live provider/payment/mail/deploy, GPU rental, weight download, heavy dependency install, Docker build/run or sandbox escape occurred.

## Concrete result

Node controller reuses createJobs for claim/10s heartbeat/complete/fail and existing reserve release. One persistent Python engine serves bounded JSON-lines; cancellation kills it on lost lease/fixed180s attempt or360s job bound; restart clears model warm state. Fenced attach independently verifies bounded actual input/output/depth/config SHA256, PNG format and exact dimensions. All artifacts use generated UUIDs; symlink/traversal/oversize/protocol overflow fail. Failure/stale-fence cleanup removes output/depth/config, periodic sweeps retain live references and retry stale/deleted cleanup.

Python implements offline pinned SD1.5+ControlNet-depth+DPT depth-conditioned img2img with seed/style/config, depth derived from input, aspect preservation by resize/pad/crop/restore, mandatory retained safety checker and flagged-output rejection. Manifest hashes every provisioned file and license and enforces exact repository/revision/license pins. Unsafe pickle/bin/ckpt/code and remote loading/downloads are denied. Pinned Intel DPT upstream lacks safetensors; actual loading is deliberately blocked until safely provisioned/compatibility verified. CUDA/model/dependency absence is explicit, never CPU/fixture fallback. Model/GPU success is not claimed.

GET /api/jobs/:id/result serves actual immutable owner-only output bytes with inherited no-store/noindex, rejecting missing/tombstoned/rejected/cross-owner/hash mismatch and rechecking state after read. No public quality setter or fake public share endpoint exists. Separate trusted server CLI requires server-configured QUALITY_OPERATOR_ID. Immutable canonical evidence digest and append-only quality_review bind actor/time/output/evidence/report; actual bytes/config and independently measured corpus report must match. Acceptance requires real provenance and at least36 pairs/12 distinct inputs with>=3 styles each, zero changed openings and anchors<=2% diagonal. Rejection revokes read/eligibility, uses the existing unique release if reserve existed, and cannot reaccept. SQL finalization rechecks ordered account->job state/source/evidence/hold; hashes happen outside locks. F04 receives a quality eligibility guard checking current accepted review and actual bytes, and must perform its own final consent/hold serialization.

## Files and source identity

Product/source paths (relative to PROJECT_ROOT):

- .env.example
- db/003-quality.sql
- web/generation.js
- web/quality.js
- web/jobs.js
- web/app.js
- web/media.js
- scripts/worker.js
- scripts/quality.js
- scripts/migrate.js
- scripts/maintenance.js
- scripts/mutation.js
- worker/engine.py
- worker/manifest.py
- worker/requirements.txt
- worker/test_engine.py
- tests/engine-double.py
- tests/generation.test.js
- tests/quality-fixtures.js
- tests/quality.test.js
- tests/quality.integration.test.js

Evidence: docs/features/f02b/attempt.json, events.jsonl, checks.json, build-snapshot.json, runtime.md. No old receipt was modified. Canonical source snapshot is SHA256 of compact sorted-key JSON {files:[...]} with sorted paths and per-file SHA256, covering45 production/test/runtime-manifest files, including unchanged regression sources. Excludes docs, node_modules, cache/pyc and environment files; .env.example changes are disclosed above but excluded as an environment template. Build-Revision is a source digest, NOT a built container/image digest (image digest=null).

## Executed checks

All commands below ran from PROJECT_ROOT unless stated. Raw safe local test logs remain in /tmp/n8-f02b; no full prompts/raw agent logs are in git. Exact commands/exits/log hashes are also in docs/features/f02b/checks.json.

- `/tmp/n6b-f06-node22/bin/node --test --test-concurrency=2 tests/boundaries.test.js tests/media.test.js tests/jobs.test.js tests/mutation.test.js tests/generation.test.js tests/quality.test.js` — exit 0; 6 suite files passed; includes 10 F02b generation/subprocess and 5 quality checks. Log SHA256: d07efb17687e0d21771f092d15b3584db1e72047e5b43cd49139f96d92359c83.
- `/tmp/n6b-f06-node22/bin/node tests/jobs.test.js` — exit 0; Affected jobs unit rerun after moving evidence hashing outside SQL locks. Log SHA256: ad68d3c0ea32100450e543b74be747d20a6d0cf6044b57c379a324d4dddb3cc8.
- `/tmp/n6b-f06-node22/bin/node tests/quality.test.js` — exit 0; 5 synthetic software quality checks passed. Log SHA256: 6908e23b4ce26f29dc95107fc540a55304e044cdbf51fcbf818cb004d2451c0a.
- `python3 -m unittest discover -s worker -p 'test_*.py'` — exit 0; 5 stdlib/software tests; actual subprocess real-mode failed explicitly because GPU dependencies missing. Log SHA256: 2c20997ed551ad72ff9ed28feb157d03da452bd33c3844e3c9fe9a97d0043d6f.
- `/tmp/n6b-f06-node22/bin/node scripts/check.js` — exit 0; ESM/static syntax build; not a Docker image or GPU build. Log SHA256: 0aec2d6d64684e49007fa69ee2856c2ced7b6631bda52ca8bda26e011b3a9d81.
- `/tmp/n6b-f06-node22/bin/node scripts/mutation.js fixture` — exit 0; green baseline exit0; mutated targeted assertion exit1, expected true actual false. Log SHA256: 6dc5f612741c2ddea6e1712cb592fef1067c0ec553029d1a572dae69892cc1d9.
- `/tmp/n6b-f06-node22/bin/node scripts/mutation.js origin` — exit 0; green baseline exit0; mutated targeted assertion exit1. Log SHA256: 28a6880ccb70819ce03bc0b6b732a8e8418c89e9af4bfae4820f1afb614aab0e.
- `git diff --check` — exit 0; No whitespace errors. Log SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- `/tmp/n6b-f06-node22/bin/node tests/quality.test.js (repository root cwd)` — exit 1; Wrong cwd module path invocation, corrected to project cwd; original error log overwritten, unavailable. Not a product test failure.. Log SHA256: null (unavailable).

Counts are software evidence only: final suite runner reports6 passing suite files; focused generation checks10/10 and quality checks5/5 passed; Python5/5. Both guard mutations had baseline exit0 and targeted assertion exit1. Fixture mutation detects precisely expected=true/actual=false on “GEOM-03 fixture quality must be rejected with otherwise valid provenance”; unrelated process errors do not qualify. Actual engine subprocess returned explicit gpu_dependencies_missing on this host. Model absence and unsafe/hash/symlink manifest failures were stdlib-tested; actual CUDA execution/safety checker/model loading remain pending. One wrong-cwd invocation exited1 and was corrected; no product assertion failed. The original error log was overwritten and is not presented as measured evidence.

## Pending and coordinator handoff

GEOM-01/03 have concrete implementation and software checks, with required real PostgreSQL/review acceptance still pending. JOB-03/04 and AUTH/SEC boundaries are covered by focused software checks; full prior integration regression is required because existing app/jobs/media/migrations/maintenance paths changed. GEOM-02 and PERF-03 are separate real GPU gates, not satisfied by fixtures.

- Dedicated PostgreSQL16 F02b quality suite and full F01/F02a regression plus owner/budget mutations.
- Coordinator web Docker image build after N7 heavy mutex release.
- Fresh independent Astra source review.
- Python and integrated dependency security/compatibility audit.
- Actual CUDA + safe pinned SD1.5/ControlNet/DPT model provisioning/loading.
- GEOM-02 real licensed 12x3 corpus.
- PERF-03 at least30 actual warm GPU jobs/p95<=25s.

Coordinator PostgreSQL command: dedicated local/internal TEST_DATABASE_URL and N8_TEST_DB_OWNERSHIP=n8-f02b, then `node tests/quality.integration.test.js` (six nested scenarios, actual random isolated schema, no mock DB). Cases include otherwise-valid synthetic real branch, immutable evidence/review mutation denial, acceptance->rejection release, concurrent reviews, absent reserve, fixture exclusion, missing/mismatched report, changed output, private actual HTTP bytes/no-store/noindex/cross-owner404/deletion/no user setter. No PostgreSQL result is claimed. After N7 releases /tmp/codex-heavy-build.lock, coordinator runs full F01 integration with marker n8-f01 and F02a with n8-f02a, owner/budget mutations and web image build under CPU<=2; no GPU image build here. Commands/prerequisites and report/manifest schemas are documented in docs/features/f02b/runtime.md.

Fresh independent Astra review was not performed in this no-delegation executor attempt. Final feature/roadmap acceptance must stay pending. Dependency pins were copied from approved primary/PyPI candidate plan, not installed/audited; security and GPU compatibility are unknown. All real-branch test images/measurements/reports are explicitly SYNTHETIC SOFTWARE TESTS and must never be used as operator/GPU acceptance evidence. Provider-resolved model/effort, usage, cost, active intervals and image digest remain unavailable/null.

Completion here denotes the bounded coding attempt and concrete handoff, not passed delivery gates or full F02 acceptance.

Status: completed
