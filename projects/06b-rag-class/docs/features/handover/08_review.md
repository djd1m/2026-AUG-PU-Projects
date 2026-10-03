# F14 independent review, attempt review-1

Verdict: **REQUEST_CHANGES**. One medium regression finding requires a bounded test correction. No additional concrete blocker/high product defect was established in this source review. Mandatory full regression, real-PG mutation and production UI evidence remain delivery gates; this review does not accept the feature.

Run-ID: 20261003T042338Z-handover
Work-Unit-ID: handover-review
Attempt-ID: review-1
Source-Revision: 3890760ff1ea36440e938db70c58e21754f44aa4
Build-Revision: none
Launch-SHA256: a0e59b016bc3a593d74e3f0c3f926db0e676c8cb9a35ef4f37f1479f4d156d97
Profile: compact-quality-first-v2; substantive risk XL.

The source identity includes the 22-file dirty-worktree map at `tests/artifacts/handover/implementation-source-hashes.json`, not HEAD alone. Independent read-only hashing found all 22 files matching and the exact map-file SHA256 `0c1ea7f83dedd9fd498141157982df546363ecf67b19ca325fad76dd76d1d4fe`. Its terminal newline is part of that digest; the separately supplied canonical map-only digest is not evidence of drift. The launch-file digest also matched the caller's value above.

## Independent obligations first

Before reading the F14 plan, implementation, tests or author report, read canonical Specification FR-n6b-14 / SC-US-014-1..4, Pseudocode Handover to client and Studio sub-account, Architecture account/RLS/security boundaries, ADR-008, Refinement conflict/concurrency requirements, and the accepted F13 family-lock obligation. Root/project instructions and applicable model, telemetry, complexity, security, testing and shared-resource rules were applied. These establish the following obligations independently of the author:

1. Transfer credentials of the existing account, preserving bot public ID, embed code and tenant-owned data. Do not move bots into another account.
2. Only the authenticated eligible root studio can issue a seven-day, random 32-byte, hash-only link for its unclaimed child. Kept studio access must not grant credential reset, reissue or second-token takeover after claim.
3. Accept must validate token/body/Origin and explicit boolean, hash the password outside the transaction, then atomically update credentials/access, consume the token and create the client session. Cookie emission follows committed success.
4. Invalid/used/expired links and occupied case-insensitive email must leave account/token/session state intact. Duplicate email has the canonical 409 message; unrelated database errors cannot become email conflicts.
5. Concurrent claims and email races need a database arbiter. Compatible UUID-ordered account locks must preserve F13 membership classification and cap5 through commit. Expiry must be checked after blocking operations, with a throwing final guard to roll back preceding writes.
6. Retain real session actor and tenant RLS, revoke studio access when requested, charge the actual bot owner, and prevent secret leakage through errors/logs/referrers/caching. UI access selection must not impersonate a child.
7. Real-PG barriers, rollback/data snapshots and semantic mutation evidence are required for atomicity claims; unit mocks and static UI assertions have narrower evidentiary scope. Full existing regression and actual UI remain mandatory.

Then read F14 `01_plan.md`, production changes, unit/integration tests and fixtures, mutation script, and `05_completion.md` with its saved check artifacts. No donor source was read.

## F-1 — medium: changed middleware leaves the required referral regression red

Location: `apps/web/src/middleware.ts:18`, with the stale assertion at `apps/web/tests/unit/referral-cookie.test.ts:18`.

The implementation adds `/handover/:path*` to `config.matcher`, while the existing first-touch test still requires exactly `['/', '/b/:path*']`. This deterministically fails the existing suite, violating HAN-07 and the mandatory complete-regression rule. The changed matcher itself serves the intended handover privacy boundary; the evidence does not establish a broken landing-cookie product flow.

Saved reproduction: `tests/artifacts/handover/coordinator-middleware-seam.txt` shows the exact array difference and **1 failed / 10 passed**; `coordinator-middleware-seam-exit.txt` contains **1**. Reviewer inspected both source and saved failure, without rerunning it.

Reproduction command for the correction owner, from the project root:

```sh
PATH=/tmp/n6b-f06-node22/bin:$PATH node node_modules/vitest/vitest.mjs run --config vitest.config.ts apps/web/tests/unit/referral-cookie.test.ts
```

Minimal correction: update the exact matcher expectation to include the handover path and add a middleware behavior test for `/handover/<token>?ref=<valid-ref>` asserting `private, no-store`, `no-referrer`, `noindex, nofollow`, and absent `Set-Cookie`/referral cookie. Retain the current landing first-touch, no-overwrite and demo-cookie tests. Then run this affected seam and the complete unit/contract gate, bind new evidence to the corrected snapshot, and close the remaining mandatory gates. Do not delete or weaken the legacy first-touch assertions to obtain green.

Confirmed severity counts: blocker 0, high 0, medium 1, low 0. Pending execution evidence below is not presented as an invented product defect.

## Source and oracle assessment

| Obligation | Inspected evidence and conclusion |
| --- | --- |
| Issue authority and ownership | `packages/db/src/handover.ts:14` locks accounts in UUID order, rereads state, and `eligible` at line 20 requires root studio, own owner-child, access and both null credential fields. `issueHandover` reuses that check under lock. `listHandoverCandidates` returns only IDs. Handler line 51 validates Origin before authentication; session actor, not body/selector, supplies authority. |
| Token material and TTL | Handler lines 59/72 generate 32 bytes and reject noncanonical base64url by decode/re-encode. SHA256-only material crosses to the DB; issue expiry uses `clock_timestamp() + interval '7 days'`. Repeated pre-claim issue is explicitly permitted; first claim makes all remaining links unusable by the shared unclaimed guard. |
| Atomic acceptance and cookie | Handler lines 81..84 perform bcrypt12 and session preparation before `acceptHandover`. DB lines 70..79 write existing account, session and final token in one `withService` transaction. `tenant.ts` returns only after COMMIT; handler line 90 then constructs the session cookie. Session/final-token failures test full account/token/session rollback on real connections. |
| Expiry and error mapping | Account and token locks precede the fresh `clock_timestamp()` read. Final token update follows potentially blocking unique-email/session writes; zero rows throw `HandoverExpired`, ensuring rollback instead of a successful transaction callback return. Only `23505/account_email_key` maps to 409 after rollback. Existing unique index is on `lower(email)`; shared credentials schema normalizes input. |
| F13 ordering and cap | F14 takes all discovered account locks in UUID order before its token lock; it does not lock/update bots. F13 takes source-bot KEY SHARE, then account UUID locks, and rereads membership before insertion. No inverse bot dependency was found in F14. A changed parent fails eligibility rather than acquiring extra unordered account locks. Real F14/F13 tests cover both UUID orders and before/through-commit classification, and keep/detach versus cap5. |
| Data, RLS and quotas | Handover writes only account/session/token. Tests snapshot bot/source/source_file/document/chunk/job/question/growth/model-call data, preserve embed/publication IDs, and exercise both access branches with tenant connections. Fixtures seed substantive bot/source/document/chunk/job/file/log rows; equality of an empty model-call set is not proof of a populated provider workflow. Revoked studio calls across bot/source/PDF/job/retry/publish/ask return 404; fake provider zero calls proves denial only. Existing ask handler still uses `bot.accountId` for sandbox quota. No schema/grant/role changes or child impersonation were introduced. |
| Privacy and UI | Scoped Next/page/API headers implement no-store/noindex/no-referrer and framing denial. Middleware returns before referral-cookie logic on handover paths. Success audit contains account ID and keep flag only; catch responses omit exception details. Labelled UI, unchecked keep checkbox, pending state, copy feedback and retries exist. Framework header precedence, real stream behavior, browser flows and runtime logs still require actual UI evidence. |

`handover-race.int.test.ts` uses real PostgreSQL queries, observed `pg_stat_activity` waits and controlled release barriers. It covers same/different tokens for one child, two-child email uniqueness, actual PgAuthStore registration conflict, issue eligibility after a wait, account/token/email/session expiry waits, still-valid controls, issue-versus-accept, cap and family ordering. `observePool` delegates to real SQL; its pause/fault hooks are not fabricated database success responses. Before/after snapshots assert full account/token/session equality on negative outcomes. These are credible authored oracles, not executed proof from this review.

`mutate-critical-guard.mjs` verifies the frozen files and required PG environment before mutation, runs the fixed claimed-keep-access test baseline, removes the unclaimed guard, requires a behavioral AssertionError rather than setup/network/timeout failure, restores exact bytes in finally, and runs the identical green test. Static inspection supports its intended oracle; syntax success alone does not establish the required real-PG mutation result.

## Verification disposition and delivery limits

- Saved author evidence inspected: final typecheck exit 0; focused unit suite 40 passed in 5 files; Origin mutation 1 failed / 38 passed, exact restore then 39 passed; final additional auth regression brings the suite to 40. The author records the initial fixture failure and does not hide it.
- Coordinator middleware seam: exit 1, 1 failed / 10 passed. This is concrete counterevidence to full-regression acceptance despite focused green checks.
- At evidence inspection, `final-full-regression.txt` was an in-progress log, not a terminal all-gates receipt. The saved nonfailfast `full-gates.sh` collects typecheck/unit/integration/critical-mutation/build exits independently and requires all zero. Its existence or partial output cannot close those gates.
- Reviewer ran no tests, probes, Docker, network calls, port operations or mutations. Read-only source/launch hashing passed. Build identity for this review remains none.
- Full unit/contract success after F-1 correction, complete real-PG regression, semantic DB mutation, production build and source-bound 1440/390 actual UI checks remain coordinator-owned mandatory work. UI must include both keep branches, login/reload, actual studio access/revocation, 404/409/410, header/body-stream/cookie behavior, console/overflow/log evidence and cleanup. E2E preflight here is `not_applicable`: bounded read-only review; coordinator needs a fresh ready preflight before E2E.

## Execution identity and handoff

Requested reviewer: `gpt-6-astra`, effort `high`; native actual reviewer model/effort and fallback are unavailable inside this attempt and require coordinator reconciliation. Implementation native metadata separately identifies `gpt-6.1-sol/high`; it is not evidence of the reviewer model. No model switch is claimed from the requested label.

Applied skill: repository `../../.claude/skills/project-work-companion/SKILL.md`, delivery/evidence stage only. Existing run/events/work-record remain coordinator-owned. No children, product edits, commits, global configuration changes or manual TRACE writes were performed. Only this report is written by the reviewer; the complete final CLI answer supplies the receipt at `docs/telemetry/p-replicator/20261003T042338Z-handover/evidence/review-1-receipt.md`.

Launch time: 2026-10-03T04:57:32.011951+00:00. Hard budget: 480 seconds inclusive of report and final receipt. The final receipt records actual finish time and elapsed wall duration. Active duration, reviewer input/cache/output/reasoning tokens and cost are null because no native counters were exposed; no savings claim is made. Review completion and REQUEST_CHANGES are separate statuses.

Status: completed
