# F12-R1 bounded correction — correction-1

Verdict: **bounded correction handoff**. Only the stale F11 matcher assertion and the requested demo-path regression case changed. F12 feature acceptance remains with the coordinator.

Run-ID: 20261003T021046Z-demo-page  
Work-Unit-ID: demo-page-correction  
Attempt-ID: correction-1  
Source-Revision: 24d7e6fb85c425347ae31205f43888575e84594c  
Build-Revision: none  
Launch-SHA256: 1bd881353c53223842e2bc46ad9f68b7f9575dc5f8c405db4e032608e84b3f3a  
Snapshot-SHA256: eb5370af0ae47b9dd6a5534ba49ba43940ccb0f2f6aea9427f82126601a0ad7d

## Correction and acceptance criteria

- Matcher expectation is exactly `['/', '/b/:path*']`, matching the intentional middleware coverage.
- All existing first-touch, cookie attribute, invalid-input, reader and development assertions are retained.
- Direct middleware invocation for `/b/slug?ref=Abcdef_12345` requires no `n6b_ref` cookie, no Set-Cookie header, and `Cache-Control: private, no-store`.
- No production source was edited. All original 24 mapped production/config/test files match their exact-byte hashes; the final map contains those unchanged entries plus the corrected referral test (25 total).

## Observed checks

The initial affected suite reproduced F12-R1: **1 failed / 9 passed, exit 1**, at the matcher assertion. The corrected suite passes **11/11, exit 0**. Root and web local typechecks both exit **0**, with no diagnostics. Web typecheck disables incremental output to preserve the allowed file scope. Commands, exit codes and terminal output are indexed in `tests/artifacts/demo-page/correction-1-checks.json` and its referenced files.

The route command returned mechanical **M / exit 0**, because existing test text includes TTL/maxAge. Substantive ROUTE before planning and implementation: **S test-only correction**, no new public behavior, schema, container boundary or shared resource. This bounded attempt inherits the existing F12 risk/gates; it does not reduce their requirements. Production mutations, full unit/PG/build and E2E are excluded by the explicit brief. The initial red run proves the reported matcher failure; no claim is made that a new production mutation was performed. No concurrency test applies to this correction. Project-work-companion handoff applies; E2E preflight is `not_applicable` because no E2E was run.

## Immutable evidence and handoff

`tests/artifacts/demo-page/final-source-hashes.json` freezes the sorted compact JSON files-map digest **eb5370af0ae47b9dd6a5534ba49ba43940ccb0f2f6aea9427f82126601a0ad7d**. The original implementation map/history remain unchanged. Scope verification is saved in `tests/artifacts/demo-page/correction-1-scope-check.json`.

Coordinator next step: run mandatory full regression and real-PG gates against this new snapshot, then the existing source/build-bound HTTP/browser acceptance gates. Those are out of this executor's authorized scope and are not claimed passed. No final feature acceptance or build identity is claimed here.

Profile: `compact-quality-first-v2`. Requested model/effort: `gpt-6.1-sol` / `high` from the launch. Independently exposed native actual model/effort, fallback, usage, cost and active time: **null/unavailable**. No model switch or savings is claimed. The existing launch records the attempt before work; run/events/work-record/roadmap remain coordinator-owned and untouched. CLI `-o` captures the terminal receipt; this executor does not manually write TRACE. Actual Finished-At and elapsed from the launch are supplied in the final receipt.

Telemetry: `docs/telemetry/p-replicator/20261003T021046Z-demo-page/`. Receipt destination: `docs/telemetry/p-replicator/20261003T021046Z-demo-page/evidence/correction-1-receipt.md`.
