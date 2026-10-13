F10 bounded implementation is ready for coordinator handoff. Feature acceptance remains pending.

Run-ID: 20261003T000534Z-badge-referral
Work-Unit-ID: badge-referral-implementation
Attempt-ID: implementation-1
Source-Revision: 4a4f602cda39954900365d3ba7085db7c4d732b3
Build-Revision: none
Launch-SHA256: 82906a01abc6e5d03797de70c7b55c40f36cfb2f9cf8a5227e111f0d8c628a55
Finished-At: 2026-10-03T00:26:56Z
Verdict: bounded implementation handoff

Implemented REF-01..06 within the plan:

- Fixed local click redirect with HMAC/Moscow-day deduplication using the existing partial unique index. Missing trusted IP redirects without recording a click.
- Edge-safe landing middleware sets the first-touch cookie for 30 days, with required security flags and no public caching. Repeated visits never overwrite or renew it.
- Registration attributes from cookie only, resolving and locking the source bot inside the account/session transaction. Missing or deleted bots permit ordinary registration.
- Shared trusted-studio resolver excludes studio/direct-child referrals. F13 HTTP/UI wiring remains pending.
- Authenticated same-origin removal intent uses the existing account-row lock. Free cabinet button and truthful landing are connected; plan and badge state remain unchanged.

Changed 17 source/test files. Verification:

- Node22 typecheck: exit 0.
- Focused units: exit 0; 78 tests across five files.
- First-touch mutation: exit 1 with the fixed assertion failing; exact byte restoration; unchanged suite exit 0, 10 tests passed.
- `git diff --check` and file-size checks: exit 0; largest changed source/test file is 185 lines.
- Nine real PostgreSQL cases authored, covering concurrency, attribution, rollback, source locking and family exclusions. **Not executed here.**

Source snapshot SHA256:
`4f6cfc242b7863ba0f586b07a46b3cdbcd24cbb0d10360895c90679c11a94dff`

Evidence: [completion report](docs/features/badge-referral/05_completion.md), [source hashes](tests/artifacts/badge-referral/implementation-source-hashes.json), [checks](tests/artifacts/badge-referral/implementation-checks.json), and [mutation receipt](tests/artifacts/badge-referral/first-touch-mutation.json).

Coordinator gates remain: full frozen-source unit/PG/build checks, immutable build receipts, independent Astra review, and actual browser checks at 1440/390 after E2E preflight. Focused PG command:
`./node_modules/.bin/vitest run --config vitest.int.config.ts apps/web/tests/int/referral.int.test.ts`

Profile: `compact-quality-first-v2`, substantive M. Requested model: `gpt-6.1-sol`, high. Native actual model/effort, usage and cost are unavailable; coordinator reconciliation remains pending. Elapsed from launch: approximately 709 seconds, within the 1500-second bound.

Coordinator telemetry was preserved. No children, Docker/ports, installs/network, schema/manifests/toolkit changes, commits or push. CLI `-o` owns the final receipt; TRACE was not manually written.

Status: completed