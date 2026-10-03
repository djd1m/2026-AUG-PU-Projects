# Browser upload observation correction

RUN_ID: n8-20261002-1740; WORK_UNIT_ID: n8-ui-upload-fix;
ATTEMPT_ID: n8-ui-upload-fix-1.
Source: 76d31d73c75eb67f0bdb7f05a0561cb8196c31a4.
Launch-SHA256: 73a2f2a44a4093e9fbe6495eb0c83f7dedb296c93f70f7c94d4d1bf9c8a7874d.

Preparation began at 2026-10-03T02:21:58Z. Profile:
compact-quality-first-v2; requested and CLI-confirmed model gpt-6.1-sol,
effort high (CLI banner `/tmp/n8-ui-upload-fix/runtime.log`). No fallback or
delegation. Usage, cost and active time are null: no attributable counters.
Hard attempt budget: 480 seconds, including preparation. Parent owns the existing
run passport; this work unit owns this stage record and its unique terminal receipt.

Scope: only `scripts/ui/browser-cases.js` upload observation, one focused local
test, this explanation, and the assigned receipt. Production, payment fixture,
other browser cases, dependencies and global configuration are excluded.

ROUTE before planning: S, bounded fixture observation without production/API
contract changes. Mechanical router unavailable: repository
`scripts/complexity-router.sh` is absent (exit 127); this is not a passing route.
ROUTE before implementation retains S and the same scope. Required checks:
focused regression, guard mutation, and `npm run build`. Actual browser E2E and
independent review belong to the parent and remain pending, outside this unit.
Preflight: not_applicable, because this unit does not execute E2E.
No additional approval is required; the supplied brief authorizes the correction.

Donor: existing application `web/public/app.js` selects the POST-returned UUID
after reloading uploads; `web/app.js` exposes authenticated `GET /api/uploads`,
and `web/media.js` lists owner UUID, dimensions, MIME and creation time. These
source-bound interfaces are compatible; reuse them without production changes.
Confirmed evidence is `docs/telemetry/n8-20261002-1740/n8-ui-e2e-3-receipt.md`:
Chromium evicted the POST body used by Playwright `Response.json()`. Previous
failed E2E history remains intact. Forecast: insufficient_data; estimate and
savings null, no comparable accepted baseline.

AC: preserve the real POST HTTP 201; never read its CDP response body; obtain a
fresh selected UUID from the application DOM; require the same UUID to be the
single new entry in authenticated same-origin owner metadata, with valid metadata.
Reject stale IDs, missing metadata and failed POSTs. No business mocks in E2E.

Implementation: `upload()` reads the owner list using page-context fetch with
same-origin credentials and no-store caching, snapshots owner and DOM IDs, keeps
the exact real POST 201 assertion, and waits for a new selected UUID. A second
page-context owner GET must contain exactly one new upload matching that UUID,
with positive integer dimensions, normalized WebP MIME and a creation timestamp.
The helper does not call Playwright Response.json on the upload POST. Other
browser assertions and the independently accepted payment correction are intact.

Verification: `PATH=/tmp/n6b-f06-node22/bin:$PATH node tests/ui-upload.test.js`
passed 10/10, exit 0. Local protocol doubles exercise observation only and do not
claim real browser, HTTP or PostgreSQL acceptance. Temporary mutation restoring
the CDP body read failed 9/10 tests, exit 1; mutation removing UUID binding failed
1/10, exit 1. Original corrected bytes were restored in finally, and the focused
set passed 10/10 again. `npm run build` passed, exit 0, using Node v22.22.3;
this project build checks all ESM/static JavaScript syntax. No unrelated suite
or actual E2E was run. Readiness remains not_applicable for this work unit.

Stage: handoff. Independent parent review and actual full browser rerun are
pending, outside this bounded unit. The terminal receipt records measured wall
time, exact changed paths, source/check digests and measurement gaps. The prior
E2E failure is preserved; this correction does not establish aggregate E2E PASS.
