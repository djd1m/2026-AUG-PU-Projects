# I6b R1 bounded correction

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-replicate-i6b-r1
Source: 8041f21f515e74d883c7fbba6747ab2d45bcc561
Launch-SHA256: bf9544cbb98ad17ae977b8b2369988b88b1fb301c2e1cf585c68753ac5518192
Spec-SHA256: 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Started: 2026-10-03T15:19:49.924204+00:00 (caller launch).
Profile: compact-quality-first-v2, explicit sole gpt-6.1-sol/high writer override.
Actual model/effort, usage, cost: null; host attachment remains parent-owned.

Preparation/implementation ROUTE: mechanical S, exit 0, exact explicit file
`scripts/ui/replicate-cases.js`; substantive inherited F07 XL remains unchanged.
Scope is only confirmed I6B-R1/I6B-R2 from `i6b-review.md` and their quoted
caller/evidence contracts, plus one meaningful focused regression test if needed.
No production/backend/UI predicate/compose/driver/other-case changes.
Original nine snapshot files and protected 131 hashes matched before editing.
Existing run/launch provides identity; no run/events mutation or new work record.
Companion preflight: not_applicable, PG/browser execution reserved for parent I7/I8.
Forecast: insufficient_data; no numerical estimate substituted for measurement.

Acceptance: DELETE observation registered before click, successful 200, handler
completion and owner GET 404 precede gate release; canonical stored evidence digest
verified and reported; existing byte/null checks and finally cleanup preserved.

## Exact corrections

I6B-R1 (P2): import the existing `clickAndWaitForHandler`; register a response
predicate for exactly DELETE `/api/jobs/${deleted}` before invoking the click.
Await the matching response and handler promise together, require status 200,
retain the hidden-result check, and require an actual owner GET status 404 before
`gate.release()`. Existing post-completion 404, evidence/credit/fence/artifact checks
and finally release/cancel/join remain intact. No sleep or production change.
Contracts inspected: `scripts/ui/browser-cases.js:26-49` and the accepted async
`web/public/app.js:137` delete handler, as quoted in `i6b-review.md`.

I6B-R2 (P2): select `canonical_evidence,evidence_sha`; compare
`sha(canonical(e))` with the stored hash and return that stored hash in receipts.
Existing output/depth/config bytes, unverified quality and null provider metrics
are preserved. Contracts inspected: `web/generation.js:11-14` canonical helper
and `web/jobs.js:236-237,250-254` completion serialization/storage.

## Checks and evidence

- `/tmp/n8-node22 --test --test-concurrency=1 tests/ui-replicate-corrections.test.js`:
  exit 0, 5/5 pass, no skips. Executes the actual scoped function bodies with
  controlled boundaries, tests noncanonical nested JSONB-equivalent key order,
  corrupt stored digest, delayed deletion/handler barriers, unsuccessful DELETE,
  accessible job, and finally cleanup. In-memory broken variants are rejected by
  fixed digest and ordering oracles; no production mutation was needed.
- First focused run: exit 1, 3/5 pass; missing test-context `evidence` and overly
  strict test event-tail assertion were corrected. Original red log retained as
  `replicate-i6b-r1-focused.log`; corrected log is `replicate-i6b-r1-focused-final.log`.
- `/tmp/n8-node22 --check scripts/ui/replicate-cases.js`: exit 0.
- `/tmp/n8-node22 scripts/check.js`: exit 0, ESM/static build syntax verified.
  Final syntax/static logs bind the final product bytes; earlier logs retained.
- Source/launch binding, original eight non-owned I6b files, all 131 protected
  hashes, original nine check receipts and check-history bytes: PASS.
  Owned diff whitespace/line checks: PASS; `replicate-i6b-r1-scope.log` records result.
- Existing focused 43/43 and source checks remain historical green evidence.
  Unchanged broad checks were not rerun. Actual PG/browser gates were not run.

Product/test scope: only `scripts/ui/replicate-cases.js` and the new focused
`tests/ui-replicate-corrections.test.js`. Snapshot uses project-relative path/hash
entries and retains original eight and 131 protected bindings.
Snapshot: `docs/telemetry/n8-20261002-1740/replicate-i6b-r1-snapshot.json`.
Receipt: `docs/telemetry/n8-20261002-1740/replicate-i6b-r1-receipt.md`.

Frozen at: 2026-10-03T15:27:29.259173+00:00
Elapsed since caller launch: 459.335 seconds, including reading, correction,
focused harness correction and evidence preparation to this timestamp.
Active time: null (no host interval measurement). Actual model/effort, usage/cost:
null pending host attachment; requested gpt-6.1-sol/high is not model proof.
No savings claimed. No run/events changes, delegation, other CLI/models, Docker,
PG/browser/network/provider execution, environment inspection, installation,
commit, or global configuration changes.
Pending: fresh bounded Astra review (parent-owned, no delegation in this unit),
parent I7/I8 full runtime gates.
