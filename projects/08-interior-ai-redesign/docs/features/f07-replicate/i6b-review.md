# I6b independent bounded review

Reviewer family: codex
Requested reviewer: gpt-6-astra / high; sole reviewer, no delegation or other CLI/model.
Actual reviewer model/effort: null pending host execution receipt.
Profile: compact-quality-first-v2; inherited F07 XL risk, bounded REVIEW only.
RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-replicate-i6b-review
Source exact: 99bdfa42d16d271674542df450ff8c13bfe00494
Baseline: 1182b04232294275d7d7adb2eb0ed81bb7b53d10
Spec revision sha256: 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Launch-SHA256: a5ee91a1c50fd76abca22375ad4d3586db1a05fc5016f6242de25554c7bc4e66
Verdict: REQUEST_CHANGES

## Concrete findings

### I6B-R1 — P2: release the held POST only after the deletion commits

Location: `scripts/ui/replicate-cases.js:112-114`.

The test clicks `#delete-job`, waits only for `#result` to become hidden, then releases the held provider POST and expects the worker to fail. The accepted app handler (`web/public/app.js:137`, with `clearResult` at lines 18-21) hides the result synchronously **before** awaiting its DELETE request. The browser's accepted request pacer (`scripts/ui/browser-cases.js:8-14`) can still be delaying that DELETE while the entirely local mock POST/GET/import/completion resumes. A correct worker can therefore complete successfully before the deletion transaction fences it, causing this mandatory I8 case to fail; with other scheduling, the case passes without proving the intended deletion-before-completion ordering. Visibility is not a server deletion barrier.

Minimal fix: register the matching DELETE response observation before clicking, require its successful status, and await the existing `clickAndWaitForHandler(page, '#delete-job')` helper (or an equivalent bounded completion observation). Confirm the deleted job is inaccessible before `gate.release()`. Keep the existing finally release/cancel/join. This uses the already accepted helper at `scripts/ui/browser-cases.js:26-49`; no sleeps or production changes are needed. Parent validation must exercise this case at both viewports with the gate held until deletion is confirmed.

This finding is established by source ordering, not by a claimed browser execution.

### I6B-R2 — P2: preserve the canonical immutable evidence digest in browser receipts

Location: `scripts/ui/replicate-cases.js:24-30`, specifically line 29.

`privateCompletion` selects only `canonical_evidence` and reports `sha(JSON.stringify(e))` as `evidence_sha`. The accepted completion API computes and stores `sha(canonical(e))` (`web/jobs.js:236-237,250-254`); `canonical` recursively sorts keys (`web/generation.js:11-14`), whereas JSON.stringify preserves the key order of the object returned from PostgreSQL JSONB. JSONB does not preserve the original canonical serialization. The resulting browser receipt digest therefore does not identify the immutable evidence record it claims to report, and the test never compares it with the stored digest. Successful private output bytes do not repair that evidence binding.

Minimal fix: select `evidence_sha` alongside `canonical_evidence`, assert `sha(canonical(e)) === row.evidence_sha` using the existing canonical helper, and report `row.evidence_sha`. Preserve the existing output/depth/config byte checks and null-metric checks. Parent PG/browser validation must show the receipt digest equals the actual stored evidence digest for both ordinary and held private completions.

## Scope and observations

Reviewed the exact nine project-relative product/test paths in `replicate-i6b-snapshot.json`, their baseline-to-source delta, `i6b-slice-boundaries.md`, `i6b-implementation.md`, supplied receipts, and directly relevant accepted caller/API contracts. No old repository resurvey or optional polish findings.

- The module-local WeakSet requires a pool obtained through the owned PG16 marker/runtime/payment/schema-URL guards. Hosted setup also checks current schema, nonsymlink private storage without group/world permissions, exact test origin/runtime/payment mode, and unchanged caps 20/200 before inserting the test-only envelope.
- Hosted fixture work calls actual workerConfig, createJobs.claim, runReplicateClaim, authorization/final authorization, transport, private import/verification, and jobs.complete/evidence. Both HTTP boundaries and DNS resolution are injected; no production provider fallback or direct hosted evidence insertion was found. Prediction IDs are unique and claimed jobs are checked against the reserved target.
- The gate has a bounded rejection and finally release/cancel/join, but R1 breaks the intended ordering at the browser call site. Hold-before-send and hold-after-send use actual claim/authorized-send hooks. Missing token and disabled worker mode are separate zero-call cases. Cross-owner 404, publication refusal, release/fence checks, and null provider metrics remain in the matrix; none is claimed runtime-passed here.
- Legacy browser cases and disabled-payment runner remain; five hosted checks per viewport add ten checks to the expected legacy 42. The legacy accepted-controlnet positive seed stays explicitly synthetic. Shared browser receives page inputs and cookies, not app/DB/provider environment. Source/build preflight and image checks remain. New reservation/payment observation consumes app session intent instead of evictable CDP response bodies.
- The production UI change only extends accepted real-mode eligibility to replicate. Accepted quality, billing hold, separate consent, and existing server publication checks remain. The unverified hosted fixture cannot qualify as accepted quality.
- Compose adds explicit optional profiles, disabled mode/cleanup defaults, worker --once, separate cleanup activation, no automatic spend envelope, and no DB host ports. Hosted token/configuration is confined to optional server services. Default CPU total remains 2; reductions for optional services are documented. Actual Compose interpolation/build/start remains unverified.

## Evidence checked without executing tests

Read-only hashing confirmed all nine product/test files match both the snapshot and source commit; all 131 protected files match their recorded hashes and accepted baseline. All nine check receipt hashes match. Specification, launch, slice-boundary, implementation, check-history, and source-diff digests match their supplied bindings.

Snapshot SHA256: 0183a202e5c237eaed745543db3ca325d2fb8b2b8760048e8c4049f58471d4c3

Retained author logs show final focused 43/43, first run 39/42 with three failures, static check success, and meaningful unverified-publication mutation baseline/mutant/restored exits 0/1/0. The unchanged oracle fails on HOSTED-UNVERIFIED consent in the mutant log. These are inspected author receipts, not reviewer test reruns. Author host receipt records actual gpt-6.1-sol/high and 1282.5661531259539 seconds; its earlier artifact preparation duration is not substituted for full host elapsed time.

`git diff --check 1182b042 99bdfa42 -- projects/08-interior-ai-redesign ':!*.log'`: exit 0. The parent's separately reported cached-diff warning concerns trailing whitespace in immutable raw TAP logs. Logs were hash-checked and not rewritten; no claim of an all-log whitespace pass.

No tests, Docker, PostgreSQL/browser execution, network/provider calls, environment inspection, installation, commits, code edits, run/events edits, or delegation occurred. Only this report and its receipt were written.

## Handoff and runtime gates

Review completion is separate from acceptance: two open P2 correctness findings require a bounded correction and affected independent review. Parent owns continuation and I7/I8; this reviewer leaves no background process running.

Companion read-only E2E preflight: not_applicable — this stage is source/receipt review and runtime execution is expressly forbidden. Handoff follows `.claude/skills/project-work-companion/SKILL.md` within the calling task's authority; no new work-record, run, or events mutation was authorized.

I7 remains mandatory: canonical documentation reconciliation and full required suites, PostgreSQL race/fencing/security checks, and required guard mutations bound to the corrected source. I8 remains mandatory: actual Compose engine/build/start and owned PG16/shared-browser execution under fresh source/build/environment/input preflight and resource ownership; legacy 42 plus hosted 10 checks and unchanged disabled-payment followup. Preserve failures and raw logs. Source review, YAML parsing, and unit tests cannot substitute for these gates.

Real provider/GPU geometry, performance, billing, live activation, paid pilot and release are not accepted by software mocks and remain separately gated. Provider measurements remain null.

Reviewer usage: null. Reviewer cost: null. Active time: null. Host model/effort, usage and cost attachment remains parent-owned; no counters or savings inferred.
Finished-At: 2026-10-03T15:16:49.466088+00:00
Elapsed since caller launch: 351.609 seconds (includes startup/reading/review/artifact preparation to this timestamp).
