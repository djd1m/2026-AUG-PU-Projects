# F14 bounded author handoff

Run-ID: 20261003T042338Z-handover
Work-Unit-ID: handover-implementation
Attempt-ID: implementation-1
Source-Revision: 3890760ff1ea36440e938db70c58e21754f44aa4
Build-Revision: none
Launch-SHA256: f2438a6b6361424078d9f65a57204a0123c74419b3417e04c48523c9233b5f84
Profile: compact-quality-first-v2; substantive tier XL (mechanical ROUTE M / exit 0).
Verdict: AUTHOR SCOPE COMPLETE; FEATURE ACCEPTANCE PENDING mandatory coordinator gates.

Independent semantic validation of Astra's supplied plan was completed first in `03_validation.md`.
It found no blocking canonical contradiction; this validator then authored implementation and does not
claim independent code review. Existing authorization through MVP plans was retained. No child agents,
Docker, ports, network/provider calls, dependencies, manifests, schema/grants/RLS/toolkit/global changes,
commits/push/main merge were performed. Coordinator owns run/events/work-record, review and runtime UI script.

## Delivered behavior

`packages/db/src/handover.ts` issues SHA256-only 32-byte-token links with DB seven-day expiry to an eligible
unclaimed child of the authenticated root studio. Both operations lock account UUIDs in ascending order;
claim subsequently locks only its token and rereads time in a new SQL statement after that wait.
UNCLAIMED guards prohibit credential reset through other links or reissue even when client keeps studio access.
One service TX writes existing account credentials/parent/access, session, and final used token. Expiry is
checked again after blocking email/session writes; final guard failure throws and rolls back. Only
23505/account_email_key maps to email409 after rollback. No bot/source ownership or publication data is updated.

The two thin POST routes use shared auth validation/session factory, bcrypt12/session HMAC outside TX,
actual-byte bounds, own Origin, exact JSON-object media, required boolean, canonical 32-byte token format,
existing auth-address limiter, safe errors and cookie only after committed success. Issue accepts Next's
actual empty readable body without media. Accept returns exact canonical duplicate409 text. Audit records
only committed account ID and keep flag; no token/email/password/error content. Scoped page/API headers are
no-store/noindex/no-referrer/DENY/frame-ancestors none, including errors.

Studio cabinet shows issue/link/copy/expiry only for service-side eligible candidate IDs, never password hashes.
Client form has labelled email/password, unchecked access checkbox, pending/error/live status and cabinet
navigation after success. Both keep branches are explicit. Page GET does not consume a token. AuthService's
existing material generator is exposed as prepareSession and remains used by register/login with existing TTL.

## Source freeze and evidence

Implementation source edits stopped before 2026-10-03T04:51:57.286799+00:00.
`tests/artifacts/handover/implementation-source-hashes.json` is a sorted compact SHA256 map of all 22
changed/new production/test/script paths, including untracked files and the critical mutation script.
Snapshot SHA256: `0c1ea7f83dedd9fd498141157982df546363ecf67b19ca325fad76dd76d1d4fe`.
Exact source allowlist and <500-lines checks passed; largest changed source/test/script is 208 lines.
No extra split or expanded source scope was required. Author docs 03/05 are permitted by brief.
`implementation-checks.json` records actual commands/exits, source binding, logs and explicit pending gates.
A final read-only snapshot comparison must match this final candidate; never use the pre-implementation baseline.

## Executed checks and corrections

- `PATH=/tmp/n6b-f06-node22/bin:$PATH npm run typecheck`: exit 0, root and web including authored PG tests.
- Focused unit command: `PATH=/tmp/n6b-f06-node22/bin:$PATH node node_modules/vitest/vitest.mjs run --config vitest.config.ts apps/web/tests/unit/handover-handler.test.ts apps/web/tests/unit/handover-ui.test.ts apps/web/tests/unit/auth-handler.test.ts apps/web/tests/unit/studio-handler.test.ts apps/web/tests/unit/studio-clients-ui.test.ts`.
  Initial exit1: 5 failed/34 passed due to test fixture using X-Real-IP instead of existing X-Forwarded-For.
  Corrected exit0: 39 passed. Final source-bound exit0: **40 passed, 5 files**, after adding session material
  regression. Logs retain the failed initial attempt; no failure is hidden or claimed successful.
- Meaningful temporary production Origin guard mutation, identical fixed command: exit1, **1 failed/38 passed**,
  with behavioral AssertionError in HAN-02 Origin test. finally restored byte-for-byte; identical command
  exit0, **39 passed**. Before/after handler hash both
  `31f6a0d06a6ec65594fcf9c75265513ac40d10a6617216cde0084fafba9950e2`.
  Final added auth regression does not modify the fixed Origin test or mutated production source; final suite
  passes40. Evidence: unit-mutation-red/restored-green logs and unit-mutation-result.json.
- `PATH=/tmp/n6b-f06-node22/bin:$PATH node --check tests/artifacts/handover/mutate-critical-guard.mjs`: exit0.
- `git diff --check`: exit0. Exact source scope/linecounts: exit0.

## AC disposition and mandatory remaining work

| AC | Delivered evidence | Remaining acceptance evidence |
| --- | --- | --- |
| HAN-01 | Issue authority/hash/TTL implementation; empty-stream/hash/boundary unit tests green; PG issue matrix authored | Real PG TTL/authority/reissue/after-wait execution and Next body-stream UI |
| HAN-02 | Atomic credentials/session/parent/access/final token TX; bcrypt/session outside; 409/404/410/422/413/429/503/cookie unit checks green; auth material regression green | Real PG forced rollback/final guard/session uniqueness/password login, runtime cookie |
| HAN-03 | Stable account UUID, no bot/source mutation; full data snapshots and actual RLS/direct-route denial/fake-provider zero-admission tests authored | Execute both access branches against real PG and runtime UI |
| HAN-04 | Locked UNCLAIMED issue/accept guard; different-token claimed keep=true reset test and critical mutation script authored | Real PG fixed test, behavioral DB mutation RED/exact restore/GREEN |
| HAN-05 | Exact canonical409 and unique-index-only mapping; normalized duplicate/retry unit+PG tests authored | Real PG same-email/two-child and actual PgAuthStore registration races |
| HAN-06 | Real lock observations/barriers; same/different token, issue/accept, four expiry waits, three still-valid controls, cap5 real detach/keep, real F14/F13 family before/through-commit with both UUID orders authored | Execute real PG suite, inspect results/resources/timeouts; no SQL mocks as atomic proof |
| HAN-07 | Typecheck/focused units/security mutation/scope green | All unit/contract, all real PG, production build, critical PG mutation and fresh independent Astra review <=480s |
| HAN-08 | Accessible issue/copy/expiry/accept both branches and scoped safe headers implemented | Coordinator authors tests/e2e/handover.mjs; ready companion preflight, actual production Docker UI at1440/390, console/overflow/404409410/login/reload/access/header/log/screenshot evidence |

Real PG tests were authored, typechecked, and **not executed** in this author attempt. No PG pass/count is claimed.
No production build, all-unit/full-PG, independent code review or real UI pass is claimed. Current E2E preflight:
not_applicable because author did not perform runtime/E2E; coordinator must produce a fresh ready preflight.
All remaining gates are accepted-scope mandatory work, not exclusions. They block F14 acceptance/release.

The bounded critical script is invoked under exclusive source ownership with the existing isolated PG env:
`PATH=/tmp/n6b-f06-node22/bin:$PATH node tests/artifacts/handover/mutate-critical-guard.mjs`.
It verifies the final frozen map, requires all three TEST_* PG vars before mutation, runs the fixed
HAN-04 claimed-keep-access guard baseline, removes the locked UNCLAIMED guard, requires a behavioral assertion
red, restores under finally, verifies byte equality and **final snapshot**, then runs identical restored green.
Each run has90s timeout and emits logs/result JSON. Missing DB/import/timeout is not mutation success.
It has not been run here; syntax verification is not DB evidence.

Next coordinator: reconcile native model/usage and run/work-record source drift; execute focused real PG
and critical mutation, full unit/PG/build; independent Astra review against exact hashes; write/run actual
UI script after ready preflight; correct only concrete findings, rerun affected gates and refresh hashes.
No author receipt substitutes for these gates. No telemetry/history/roadmap completion was edited by author.

Requested model/effort: gpt-6.1-sol/high. Actual model/effort and fallback: not independently observable
inside author attempt; coordinator native metadata required. Author input/cache/output/cost/active-wall counters
are null because unavailable, never estimated from text. Outer PLAN native JSON separately confirms
Astra/high and partial cumulative usage; it is not attributed to this author. Final wall elapsed is measured
from launch metadata in implementation-checks.json, inclusive of validation/read/implementation/tests/docs.
No baseline savings claim. Final substantive receipt is returned to CLI -o; TRACE is not written manually.
