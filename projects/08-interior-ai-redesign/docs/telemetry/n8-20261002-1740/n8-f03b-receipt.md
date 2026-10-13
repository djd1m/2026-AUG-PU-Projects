Implemented the bounded F03b backend. Author verification passed; feature acceptance remains pending coordinator PostgreSQL checks and fresh independent Astra review.

Run-ID: `n8-20261002-1740`  
Work-Unit-ID: `n8-f03b`  
Attempt-ID: `n8-f03b-1`  
Source-Revision: `6e8d4219adef24efdafc0c79c72aebcc36663184`  
Launch-SHA256: `9d91c50ed628c78b1c6ef53b74f22a6f7db6f3ccc8be8f8039a33d1b060ad0b1`  
Build-Revision: `6c8951f3cd81b270fef020eff3eb38dd744c4af8f96a11e79410cc6688e6418f`  
Started-At: `2026-10-02T23:20:52Z`  
Finished-At: `2026-10-02T23:35:57.924525+00:00`  
Duration: **905.925 seconds / 15.10 minutes**, within the 20-minute bound.

The implementation provides authenticated, exact-Origin attribution state, consent, denial, capture, manual-code and clear operations. Tracking defaults to false. The protected 30-day cookie requires server consent, account binding and valid integrity proof. Missing, blocked, tampered, duplicate, cross-account and expired cookies cannot use stored cookie attribution. Denial clears attribution and the tracking cookie while preserving the essential session.

Manual active owner-bound codes work without tracking cookies and override preferences before each new intent. Invalid codes leave preferences unchanged. Existing intent snapshots and payment idempotency remain immutable; attribution resolution uses the existing account transaction without nested locks.

The operator CLI creates active opaque codes for existing accounts, changes activation state and returns aggregate totals. Duplicate codes produce service-boundary409; database owner/code binding is immutable. Legacy ownerless partners become inactive and ineligible. Aggregates count distinct valid first conversions and sum verified90000minorRUB winning payments, excluding repeats, replay, refunds, holds, review, self, inactive, ownerless and mismatched records. No public registry endpoint, UI, dependencies or commission/reward/payout writes were added.

Verification completed with Node22: **47 tests passed, 14 recorded checks exited0**.

| Check | Result |
|---|---|
| Static build and final syntax check | Passed |
| Attribution, partner and injected HTTP-handler tests | 11 passed |
| Boundaries, media, jobs, quality, payments and mutation-harness regressions | 36 passed |
| Consent guard mutation | Baseline0 → targeted assertion failure1; detection passed |
| Owner-bound guard mutation | Baseline0 → targeted assertion failure1; detection passed |
| Diff whitespace, source scope and snapshot/log integrity | Passed |

Initial test attempts failed because of an incorrect working directory and missing fixture budget configuration. Both were corrected; the failures remain recorded.

Mandatory pending work: isolated PostgreSQL16 attribution suite with `N8_TEST_DB_OWNERSHIP=n8-f03b`, existing auth/payment/jobs/quality PostgreSQL regressions, payment HTTP tests and fresh independent Astra review. No Docker, database runtime, listening socket, browser, external provider, payment, email, GPU, deployment, commit or push was attempted. Injected handler tests do not establish runtime/E2E acceptance.

The 14 source/test files changed are migration005; attribution and partner services; application/payment integration; partner, migration and mutation scripts; five attribution/partner test files; and the existing payment integration fixture. No extra source file outside the approved allowlist or root/shared/N6/N7 change occurred. The canonical snapshot covers **66 production/test/runtime files**, including `.env.example` and `.dockerignore`; F03a evidence remains unchanged.

Profile: `compact-quality-first-v2`; substantive **XL** retained over mechanicalS. Requested model: `gpt-6.1-sol high`. Actual provider-resolved model/effort, usage and cost: **null**, because authoritative host counters were unavailable. No delegation or model switch occurred. Duration includes reading and fixes; coordinator time to acceptance remains unknown.

Exact commands, timestamps, exits and individual log hashes are in [checks.json](projects/08-interior-ai-redesign/docs/features/f03b/checks.json), SHA256 `70c2fe2e0d602f7a6d984f0ebd57d3b9b47731c07b35f1bd3d7f6ce37e0aa06f`. The F04/operator interface is documented in [api.md](projects/08-interior-ai-redesign/docs/features/f03b/api.md).

The substantive receipt was atomically installed at `projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f03b-receipt.md`, with an identical feature copy. Receipt SHA256: `517ecc3d23c419368e841ca0a50de00a71a06b72125f6d4190f87ce78cfc577c`.

Status: completed