# N5 support-access independent cold source/security review
Reviewer family: codex
Spec revision: sha256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Source revision: 68a2943a3cf6b7329b44c714f63e26be402b5e1e
RUN_ID: 20261028-n5-support-implementation
WORK_UNIT_ID: support-cold-review
Snapshot: /tmp/n5-support-review-snapshot-20261028
Snapshot manifest: sha256:cf6a33e92aa331fbb4b6badfbbb83cba66c430fecc294c1a1b318cd306d45515
Interface revision: sha256:560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
Context isolation: fresh reviewer; no author conversation, coder receipts, completion reports, runtime telemetry, other worktrees, or implementation history were read.
Verdict: changes_required

Review used only frozen planner documents, snapshot instructions and relevant source/tests/scripts. Two missing process-only skill references were read from their original repository locations after explicit coordinator authorization; no product source outside the snapshot was consulted. All finding sources were checked against the snapshot manifest. Manifest, specification and interface digests match the caller's expected values. No product edits, dependency installation, delegation, network calls, database/container operations, secrets, delivery, push or deployment occurred. The coordinator's statements about fixes are not acceptance evidence and do not alter this original-source verdict.

All source references below are relative to `projects/05-podcast-clips-opus/` within the snapshot. P1 means a high-priority privacy/identity defect; P2 means a required correctness or authority check fails in the stated scenario. No optional polish is requested.

## Findings

### F1 — P1: anonymous-open preserves a previously identified widget

Location: `apps/web/src/app/support/SupportPanel.tsx:20–28`; existing-widget reuse at `apps/web/src/lib/support-client.ts:37`.

Trigger: on one support page, opt in and click “Представить аккаунт в чате”, allowing `widget.setUser(jwt)` to run. Then click “Открыть анонимный чат” without an account switch, focus transition or page navigation. `loadSupportWidget` returns the same `window.Libredesk`; `open(false)` changes only the status text and calls `show()`. It never logs out that identified widget. Thus the purported anonymous conversation retains the account identity/email, while the UI says the chat opened without account email. Unchecking the opt-in checkbox likewise does not reset the existing identity before anonymous open.

Required correction: clear vendor/local identity before opening anonymous mode, ensuring invalidation does not accidentally discard the new open operation. Add an API-shaped fixture regression for identified → anonymous on the same mounted page; assert logout precedes anonymous show and no new JWT is requested. The current unit fixture manually invokes the logout helper, and browser script exercises anonymous → identified, so neither covers this transition.

### F2 — P2: anonymous context discloses account identity

Location: `apps/web/src/server/support/context.ts:6–11`; verbatim preview/copy at `apps/web/src/app/support/SupportPanel.tsx:43–49`.

Trigger: an unverified customer with an active N5 session opens `/support?videoId=<owned UUID>` and requests context without opting into identified support. The SQL checks ownership and session but selects `a.id AS "accountId"` unconditionally, with no proof/identified-mode predicate. UI renders and copies that account UUID unchanged. The same occurs for a verified customer who chooses anonymous chat. Anonymous drafts are required to omit account identity.

Required correction: the smallest correction within the frozen `{videoId?}` request seam is to omit accountId from context entirely; an identified widget already carries immutable external_user_id. Keep owner checks and safe video/status/failure/time projections. Test unverified and verified-but-anonymous context explicitly. Copy consent alone does not establish identified-mode opt-in.

### F3 — P2: proof can succeed after a session expires during the token-lock wait

Location: `packages/db/src/support-email.ts:68–73`, with the sole session expiry check at lines12–17.

Trigger: issue an unexpired long-lived verify token with issuer and confirming sessions that expire shortly. A second SQL transaction locks that token row `FOR UPDATE`. Begin confirm while both sessions are still active; it locks account/sessions, checks their expiry, then blocks at the token lock. Wait until either session has expired, then release the token row before the existing 5s statement timeout. The final UPDATE rechecks token expiry only; email proof is written although a required session is expired.

Required correction: after acquiring the token lock, recheck both issuer/current session expiry with DB wall clock before consuming or writing proof; preserve account → deterministic sessions → token locking. Existing PostgreSQL coverage blocks the account row, so expiry occurs before its sole session check and cannot catch this later wait.

A dependency-free source-extracted control-flow reproduction was actually run successfully: `node /tmp/n5-support-cold-review-repro-20261028.mjs` (exit0). It executes the snapshot confirm/sessions methods with a synthetic SQL double that advances expiry at token-lock acquisition; result is true with exactly one session-expiry check. This proves the missing recheck in source control flow, not a measured PostgreSQL race result. The concrete real-PostgreSQL schedule above remains for the coordinator's runtime acceptance.

### F4 — P2: failed-job diagnostics omit the required stage

Location: `packages/db/src/support-admin.ts:51–52`.

Trigger: inspect a failed or stalled video with a persisted latest job_attempt whose stage is stt, select or render. The jobs DTO reads only the video row: status is failed and stage_progress is merely an integer percentage. No job stage is projected, so the card cannot report where processing failed. `packages/db/migrations/001_init.sql:141–148` defines the existing `job_attempt.stage`; the UI already allows a stage field.

Required correction: project the latest relevant existing job stage alongside each bounded video summary, without exposing raw attempts/provider logs. Add an actual database card check with a failed video and known attempt stage. Numeric stage_progress does not satisfy stage.

### F5 — P2: cursor loses microseconds and silently skips accounts

Location: `packages/db/src/support-admin.ts:33–38`.

Trigger: create more than25 accounts at the same PostgreSQL timestamp with a nonzero sub-millisecond fraction, e.g. `2026-10-28T00:00:00.123456Z` (a multirow insert using now() naturally shares one timestamp). Page1 returns25 rows. pg converts created_at to JavaScript Date; `toISOString()` emits `.123Z`. Page2 compares full-precision `(a.created_at,a.id)` to `(.123Z,lastId)`. Every remaining `.123456Z` row is newer than the truncated boundary and is skipped. A mixture of nearby microsecond timestamps can lose rows as well.

Required correction: preserve exact PostgreSQL timestamp precision in the opaque cursor while retaining explicit public DTO projection and stable timestamp/UUID ordering. Test enough equal-microsecond timestamp rows to require multiple pages; every UUID must appear exactly once. The current list test only checks page size.

### F6 — P2: ledger history excludes every debit entry

Location: `packages/db/src/support-admin.ts:48–49`; debit model at `packages/db/migrations/022_credit_packages.sql:50–63`; UI promise at `apps/web/src/app/admin/support/accounts/[id]/AccountCard.tsx:20`.

Trigger: a credits-mode customer receives the signup1800-second grant and completes a300-second charge. The charge is persisted in video_credit_charge/credit_allocation and changes grant.remaining_seconds to1500. The support card's ledger contains only the original signup grant because it exclusively queries credit_grant; there is no debit ID, amount/state/time or latest debit history, despite the “Последние начисления и списания” heading and required latest20 ledger entries. Recent charges may all be absent while old grants fill the list.

Required correction: provide a bounded read-only projection of existing grant and account-owned charge entries, with explicit safe fields and a stable latest20 ordering. Reuse existing storage; no ledger engine or write capability is needed. Test a settled debit appears and bounds remain20. Merely showing a mutable grant balance is not debit history.

## Spec conformance

Verdicts assess the entire criterion. A source defect yields not met; otherwise runtime-dependent requirements remain unverifiable because this isolated review did not execute the application suites. This deliberately distinguishes sound source controls and authored test intent from measured acceptance.

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| AC-support-access-1 | unverifiable | auth.ts retains bcrypt10, seven-day random/HMAC sessions; auth-store.ts preserves account-bound registration and trial grant; support-email.reset does not grant credits. support-email.integration.test.ts has preservation cases. Full compatibility/runtime regression was not executed here. |
| AC-support-access-2 | unverifiable | support-config.ts has closed modes, isolated synthetic test and explicit SMTP settings; mail.ts uses required TLS, total8000ms race/cancellation, shared process budget4, no retry, postcommit caller. Boundary/TLS tests are authored, not executed in this review; actual STARTTLS/TLS/deadline acceptance is unmeasured here. |
| AC-support-access-3 | not met | F3 permits proof after issuer/current session expiry during token lock. Digest, random32bytes,24h TTL, account/email binding, explicit POST and one-use guards otherwise appear in source. |
| AC-support-access-4 | unverifiable | email-handler.ts schedules forgot delivery after response and returns uniform202; reset hashes outside transaction; support-email.ts atomically consumes/reset/revokes sessions and tokens, and auth-store checks old hash under lock. Authored real-PG and handler tests were inspected but not run. |
| AC-support-access-5 | not met | F3 violates post-lock wall-clock authority expiry. boundary.ts and support-email.ts otherwise enforce prebody limiter, exact Origin, strict4096 JSON, persisted5/30/5 admission,60s cooldown,10000 caps and bounded pruning. Real concurrent/cap/mutation results are unavailable here. |
| AC-support-access-6 | unverifiable | SSR page-state, API routes and transaction-local supportOperator all derive current DB membership/session; privileged CLI grant/revoke requires UUID/actor/reason and audit, grant checks active+proof. No browser grant route found. Live layer/race denial results were not measured here. |
| AC-support-access-7 | not met | F4 missing job stage, F5 timestamp cursor skips and F6 omitted debits. Existing SQL DTO projections otherwise avoid credentials/media/payment secrets; exact email search uses POST, limits25/20, card access audit exists. |
| AC-support-access-8 | not met | F1 preserves identified vendor identity during anonymous-open. Server widget.ts otherwise builds HS256 claims only for active verified current-email sessions, using UUID/email/neutral name/60s expiry and no user_id. Fixture source checks A/B calls and no unverified JWT; actual vendor identity/history remains deferred, and a same-email legacy-contact fixture is not explicitly modeled. |
| AC-support-access-9 | not met | F2 includes accountId in anonymous/unverified drafts. Owner-filtered query and identical foreign/missing404 otherwise exist; copying requires preview consent; staff deep links retain ordinary SSR/API/DB authority. |
| AC-support-access-10 | unverifiable | Logout/reset/erasure/account-change and focus/visibility source paths call clearSupportIdentity; reset/erasure revoke local authority and erase proof. Support UI and frozen docs disclose independent vendor10h lifetime and synthetic-only pilot. Actual browser lifecycle and deployment checklist acceptance were not executed/reviewed as runtime evidence. |
| AC-support-access-11 | unverifiable | Russian labelled forms, pending/error/success, disabled/test/contact states, links and wrapping CSS are present; check-support.mjs and responsive tests exist. Full tests/lint/build/PG/mutations/responsive/lifecycle receipts are intentionally outside this cold review and were not read. No local-delivery PASS is claimed. |

## Checks performed and limits

Actually performed: immutable manifest/spec/interface SHA256 checks; matching each finding source to its manifest digest; independent source/security review of frozen11 criteria and source/test/script wiring; one source-extracted synthetic control-flow reproduction (exit0). No required application test, database race, SMTP boundary, browser or build result is inferred from test existence. The source review completed in one bounded pass; all findings were sent to the coordinator before handoff.

Profile: model-routing-econom independent cold review, substantiveXL security scope inherited from frozen plan. Reviewer family is codex; host-confirmed exact model, effort, active compute, token and cost counters are unavailable and are null in the trace. Full elapsed measurement begins at caller launch if supplied; this reviewer first observed UTC at02:45:09 and records that gap explicitly. Root owns integrated runtime acceptance and existing telemetry at `projects/05-podcast-clips-opus/docs/telemetry/p-replicator/20261028-n5-support-implementation/`.

Real mailbox delivery, actual Libredesk contact/history/reply/revoke/deletion/attachment/index/backup behavior, RU deployment/capacity/restore and publication remain explicitly outside accepted local synthetic implementation. No claim about them is made. Suggested fixes are limited to accepted application behavior and its necessary regressions.

Status: completed
