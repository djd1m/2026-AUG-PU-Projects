# N8 browser upload observation correction receipt

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-ui-upload-fix
ATTEMPT_ID: n8-ui-upload-fix-1
Source: 76d31d73c75eb67f0bdb7f05a0561cb8196c31a4
Build: dirty source snapshot d4c1f9ec4de6814b28be4b12f213b7b4d15a9633853ebad3eac972ea7451a8c5
Launch-SHA256: 73a2f2a44a4093e9fbe6495eb0c83f7dedb296c93f70f7c94d4d1bf9c8a7874d
Started-At: 2026-10-03T02:21:58Z
Finished-At: 2026-10-03T02:27:14.092333+00:00
Verdict: scoped correction and local checks PASS; independent review and actual E2E pending with parent.

The confirmed Chromium content-evicted failure is corrected only in `upload()`.
The real POST still must return exactly HTTP 201. The helper does not read its
Playwright/CDP response body: it waits for a fresh selected UUID from the actual
application DOM, excluding both prior owner IDs and prior DOM IDs. Authenticated
same-origin page fetches with no-store caching establish the owner baseline and
require exactly one new owner entry matching the selected UUID, with valid
integer dimensions, WebP MIME and creation time. Failed POSTs, stale selections,
missing metadata and mismatched UUIDs cannot pass. No production or other browser
matrix changes; the accepted payment fixture correction remains untouched.

Changed files, relative to `projects/08-interior-ai-redesign`:

- `scripts/ui/browser-cases.js` — upload observation only.
- `tests/ui-upload.test.js` — local observation-protocol regression coverage.
- `docs/features/ui-upload-fix/README.md` — scope, ROUTEs, stage record and checks.
- `docs/telemetry/n8-20261002-1740/n8-ui-upload-fix-receipt.md` — this unique receipt.

Checks used existing dependencies and Node v22.22.3 from
`PATH=/tmp/n6b-f06-node22/bin:$PATH`:

- `node tests/ui-upload.test.js`: 10/10 passed, exit 0. Tests cover evicted CDP body,
  stale owner/DOM IDs, invalid UUID, failed POST, owner binding, missing/ambiguous
  metadata, metadata fields and unauthenticated/missing owner response.
- Temporary restoration of the CDP body read: 9 failed / 1 passed, exit 1.
- Temporary removal of DOM-to-owner UUID binding: 1 failed / 9 passed, exit 1.
- Corrected source restored byte-for-byte; affected focused set passed 10/10,
  exit 0. Local protocol doubles provide no real browser or business acceptance.
- `npm run build`: exit 0; all ESM/static JavaScript syntax verified.
- `git diff --check`: exit 0; production, payment-ready and browser.js diffs empty.

Source snapshot SHA-256 (sorted compact JSON of source commit and three file hashes):
`d4c1f9ec4de6814b28be4b12f213b7b4d15a9633853ebad3eac972ea7451a8c5`.

| Source/check | SHA-256 |
|---|---|
| `scripts/ui/browser-cases.js` | `bfc16391d083193d39e23e3541f35429cfac2d3c1393f8e10262d4a68fa26958` |
| `tests/ui-upload.test.js` | `651493c9c1794a79f1963b0e22a676844dbc12e0e1aa15c972b73fb8b28c6f10` |
| `docs/features/ui-upload-fix/README.md` | `7fd53623c83bfc3cd6a50356dd7c1b542760b6ccad0eb1e392e5589a0f89dcbc` |
| `scripts/check.js` | `df39e9efb54e2f5b58731c6eb7646ea840eaeada9a21b8c2f01801a2c11de58f` |
| tracked browser-cases diff | `f8f905830c7416faef68b9cfed0e368921e8abda751daa258b05973574fb7d00` |

Profile: compact-quality-first-v2; bounded S correction, one executor, no fallback
or delegation. Requested/CLI-confirmed actual model: gpt-6.1-sol, effort high,
evidence `/tmp/n8-ui-upload-fix/runtime.log` CLI banner. Wall duration including
preparation and rework: 316.092 seconds / 480-second budget. Active time,
tokens, cache usage and cost: null, unavailable attributable host counters;
numerical savings are not established.

Mechanical ROUTE attempt returned exit 127 because the repository
`scripts/complexity-router.sh` is absent; substantive pre-plan and pre-implementation
ROUTEs remain S in the stage record. This unavailable check is preserved, not
reported as a pass. Prior browser failure remains recorded unchanged in
`docs/telemetry/n8-20261002-1740/n8-ui-e2e-3-receipt.md`. E2E preflight is
not_applicable for this unit: the brief assigns actual browser rerun to the parent
after independent review. Both are pending outside this bounded correction;
no aggregate E2E, GPU/geometry or provider acceptance is claimed.

Telemetry: `projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-ui-upload-fix-receipt.md`;
stage record: `docs/features/ui-upload-fix/README.md`. Parent owns the shared run
passport. No network, Docker, install, provider, spend, secrets or global changes.

Status: completed
