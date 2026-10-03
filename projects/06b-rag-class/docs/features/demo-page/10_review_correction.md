# F12-R1 independent closure review — review-2

Verdict: **ACCEPT**, strictly for F12-R1 correction closure. No additional finding in this bounded review. This does not accept F12 as a feature or pass its remaining regression, PostgreSQL, HTTP or browser gates.

Run-ID: 20261003T021046Z-demo-page  
Work-Unit-ID: demo-page-review-correction  
Attempt-ID: review-2  
Source-Revision: 24d7e6fb85c425347ae31205f43888575e84594c  
Build-Revision: none  
Launch-SHA256: 4d6eb1d4c9d5fe168ed941781ad757b76773937dbf6d33a0da7fb35bc9ac9d84  
Snapshot-SHA256: eb5370af0ae47b9dd6a5534ba49ba43940ccb0f2f6aea9427f82126601a0ad7d

## Independent obligations and result

Before reading the previous review/correction conclusions, inspected Specification FR-n6b-11/12 and the actual middleware: landing first touch must retain its 30-day cookie behavior; demo coverage must retain cache protection without attributing a direct demo query as a landing visit. Pseudocode, Demo page step 2, explicitly supplies the demo no-store requirement. Middleware sets `private, no-store` before returning early for every non-root pathname, and its exact matcher is `['/', '/b/:path*']`.

Compared the corrected referral test with HEAD, then reconciled `08_review.md` F12-R1 and `09_correction.md`:

- The stale exact root-only matcher assertion is replaced by the exact intended root-plus-demo matcher. It remains a strict equality predicate.
- All previous root assertions survive: first-touch value, 30-day TTL, HttpOnly/Secure/Lax/path attributes, no-store, no overwrite/renewal, malformed input rejection, development Secure behavior and cookie-reader boundaries.
- The added case directly calls the actual middleware with `/b/slug?ref=Abcdef_12345`, a valid 12-character referral. It independently asserts absent `n6b_ref`, null Set-Cookie, and exact `private, no-store`.
- No skip, weakened predicate, test-only middleware mock or production edit is present in this correction. Static reasoning shows removing the non-root early return would violate the new no-cookie assertions, and removing cache protection would violate its header assertion. This is source reasoning, not an executed mutation claim.

The change closes the specific stale-test defect without sacrificing first-touch or demo-cache intent. Actual Next matcher dispatch/header precedence is outside what direct middleware invocation establishes and remains part of runtime acceptance.

## Independently verified evidence

Read-only exact-byte hashing found zero mismatches in the original 24 files and final 25 files. All original entries remain identical; the only added entry is `apps/web/tests/unit/referral-cookie.test.ts`, digest `756ed80665dd1926ffcc1007a58eaf132272b9d179a616b9ca05e8d84776c630`.

- Original canonical sorted compact files-map digest: `59bdd808a5ace6d3975826c9ba622f83a80db39e5525fdd39e06121b1114ff04`.
- Final canonical files-map digest matches the snapshot above and review launch.
- Original map file SHA256 is `dee47128ff3e974eb938fbae2b6a692a384767e4395becccb085dbacfabb90bd`, matching the final manifest's recorded original-map identity.
- Current HEAD and actual launch-file SHA256 match the identity above.

Inspected `tests/artifacts/demo-page/correction-1-checks.json` and its raw outputs. Before correction, Vitest collected 10 tests and failed only the matcher equality (9 passed, recorded exit 1). After correction, it executed and passed 11 tests (recorded exit 0). Root and web typecheck outputs contain no diagnostics; their exit-0 evidence comes from the checks index, not from interpreting empty output as success. These are saved executor results, not reviewer reruns.

At inspection, the coordinator's second `final-full-regression.txt` contained running unit output with no terminal result. No completion was inferred, no wait or rerun performed. Real-PG and actual HTTP/browser/UI acceptance remain coordinator-owned and unverified by this review.

## Scope and telemetry

Profile: `compact-quality-first-v2`. Bounded test-only correction is substantive S (saved mechanical route M/exit 0); inherited F12 public-route risk and mandatory gates remain unchanged. Applied project-work-companion for evidence handoff. E2E preflight: `not_applicable`, because no E2E is authorized or performed in this review.

Requested review model/effort: `gpt-6-astra` / `medium`. Brief reports Sol 6.1/high executor correction; independently exposed native actual model/effort and fallback evidence are unavailable, so actual fields remain null pending coordinator reconciliation. No Astra execution or model switch is claimed. Usage, cost and active time are null/unavailable; no savings claim. The 180-second budget includes reading and report work; Finished-At and launch-relative elapsed are supplied in the terminal receipt.

Only this report was manually written. No children, test probes, Docker, network, port operations, product edits, commits, N6 donor reads or global changes. Existing run/events/work-record remain coordinator-owned. CLI captures the final receipt at `docs/telemetry/p-replicator/20261003T021046Z-demo-page/evidence/review-2-receipt.md`; TRACE is not manually written. Completion means this narrow review is finished, independently of full feature acceptance.
