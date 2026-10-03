# Browser delete/auth ordering correction

Run: n8-20261002-1740. Work unit: n8-ui-auth-order-fix. Attempt: n8-ui-auth-order-fix-1.
Baseline: 8da82681889e2b0197184873e002e643eb149aac (observed HEAD matches brief).
Started: 2026-10-03T02:40:03Z. Budget: 480 seconds, no extension.
Profile: compact-quality-first-v2; one bounded executor, no delegation or fallback.
Requested model: gpt-6.1-sol high; actual model evidence and usage recorded in receipt.

Scope: the confirmed ordering defect between the existing delete/share case and R4.
AC: actual delete button click; await its real returned promise through DELETE and
uploads/account/gallery refreshes; require successful DELETE and deleted owner job
404; keep account visible before the real session revocation; preserve held actual
401, ordinary logout/new login, release and new-account survival. Production,
payment/upload corrections and all other browser cases are excluded.

Donor: existing browser-cases.js at baseline, adapt only delete/R4 boundary.
Specification SEC owner boundaries and Architecture native browser/account scopes
remain unchanged; source confirms clearResult precedes DELETE and all refreshes.
Forecast: insufficient_data, numeric estimates null; caller's 480s cap is a limit.
Approval: already authorized by brief; no new approval or native checkpoint needed.
E2E preflight: not_applicable; actual full browser rerun belongs to parent after
fresh independent review. Protocol doubles provide no browser acceptance.

Stages:
- Preparation/PLAN ROUTE: explicit fixture/test/docs paths; script exit 0, mechanical
  M from existing timeout/cache code. Substantive S: only fixture observation changes,
  no production ordering, timeout, contract, schema, provider or shared resource change;
  bounded S override explicitly permitted by brief. Overall product XL gates unchanged.
- Before IMPLEMENT ROUTE: same scope and files, same substantive S rationale; require
  focused guard, old-order mutation, existing upload test and build. No PG repeat.
- Implementation: temporarily wrap the existing onclick, retain its receiver/event
  and returned promise, use ordinary button.click, await completion and restore the
  handler. Observe successful real DELETE and ordered uploads/account/gallery 200s;
  require owner resource 404 and visible original account before R4. Actual held
  401, logout/new login, release and survival assertions remain unchanged.
- Checks: focused protocol test passed 1/1; old-order mutant (wait only for hidden
  result) failed 1/1 with "hidden result must not finish the operation barrier";
  corrected source restored byte-for-byte and passed 1/1. The same test checks
  pending DELETE/each refresh, actual click count/receiver/event/promise identity,
  rejection propagation, missing-promise rejection and handler restoration.
  Existing ui-upload.test.js passed 10/10; npm run build and git diff --check exit 0.
  Logs and machine-readable check results: /tmp/n8-ui-auth-order-fix.
- Handoff: parent commits; fresh independent review and actual full browser E2E
  remain outside this bounded unit. No production, upload/payment helper or other
  matrix changes. No network, Docker, installation, provider or global effects.
