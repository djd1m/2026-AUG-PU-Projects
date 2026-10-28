# N5 support-access bounded independent delta review
Reviewer family: codex
Spec revision: sha256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Source revision: 37e822f2cee45c2a284930ee46a90aa956ce1cb7
Base revision: 68a2943a3cf6b7329b44c714f63e26be402b5e1e
RUN_ID: 20261028-n5-support-implementation
WORK_UNIT_ID: support-cold-review-delta
Attempt: delta-01
Delta snapshot: /tmp/n5-support-review-delta-20261028
Delta manifest: sha256:9308bd0a1aaa9d7bddec08c5e210c629f0d094eebfb8bf97b47314e1c0326823
Context isolation: changed source/tests from delta; unchanged source/plans only from original immutable snapshot. No author history, worktrees, coder chats, receipts, completion, logs or runtime outcomes consulted.
Verdict: source_review_clear; runtime_acceptance_unobserved

The six original findings are resolved at source level. No concrete introduced regression was found in the12-file delta, including the bounded partial-card change. This is a source-only review conclusion, not measured application acceptance. The initial report remains unchanged at SHA2566098c140339d0dda24234edc8b954a9a4fef5c8b46f7994f86e3c9cf657c926f.

The explicitly requested brutal-honesty-review skill was read from the authorized process-only repository path and applied in direct technical mode. The caller's bounded correction scope takes precedence over its finding quota. No findings were invented to satisfy a quota. Product sources outside the two snapshots were not consulted. Every changed file matches the manifest; base specification and delta manifest digests match caller expectations.

All source references below are relative to projects/05-podcast-clips-opus, with changed files from the delta and unchanged files from the original snapshot.

## Resolution of original findings

| Finding | Source resolution | Exact source and test evidence |
| --- | --- | --- |
| F1, prior P1 anonymous identity reuse | resolved | support-client.ts:27–43 clears settings, broadcasts invalidation, handles synchronous/asynchronous logout failure; openAnonymousSupport at61–70 awaits cleanup before loading/showing, samples the post-clear epoch and cancels on later authority change. SupportPanel.tsx:20–23 routes anonymous opens through it. tests/support-widget-ui.test.ts:45–70 covers identified→anonymous, no JWT request, async rejection and epoch cancellation. scripts/check-support.mjs:99–111 asserts logout before show and opt-in clearing on the same page. |
| F2, prior P2 account identity in anonymous context | resolved | server/support/context.ts:6–11 selects only videoId/status/failureCode/at, preserving current-session owner checks and foreign/missing404. It never projects accountId. support-email.integration.test.ts:183–195 explicitly checks unverified and verified contexts omit account UUID and restricts keys; anonymous no-video draft also omits it. |
| F3, prior P2 session expiry during token lock | resolved | packages/db/src/support-email.ts:68–76 deduplicates issuer/current hashes, acquires existing account/session/token locks, then rechecks active session count with clock_timestamp after token lock before consuming proof. tests/support-email.integration.test.ts:131–155 covers issuer and confirming expiry, observes the token-row lock wait using pg_stat_activity, crosses expiry and asserts no proof/token consumption. Test execution is unobserved here. |
| F4, prior P2 missing failed-job stage | resolved | packages/db/src/support-admin.ts:57–60 adds an owned-video-correlated latest job_attempt.stage, ordered by fence/created_at/id and limited1; video summaries remain limited20. tests/support-email.integration.test.ts:73–86 checks successive select/render stages, progress distinction, foreign-video exclusion and bound. Unchanged AccountCard.tsx already allows stage. |
| F5, prior P2 microsecond cursor skips | resolved | packages/db/src/support-admin.ts:33–38 selects created_at::text and serializes that original string rather than JavaScript Date; decoder validates but does not replace its precision. cursor_at is removed from public items. tests/support-email.integration.test.ts:87–101 creates57 equal-microsecond accounts, pages all expected IDs exactly once and verifies public DTO keys and retained .123456 precision. |
| F6, prior P2 missing debit ledger history | resolved | packages/db/src/support-admin.ts:48–55 combines existing owned grants with video-owned charge rows using explicit id/kind/delta/status/at/source/video_id projection, settled negative deltas and stable combined latest20 bound. tests/support-email.integration.test.ts:102–120 checks signup grant, settled300s debit, foreign exclusion, combined20 bound and excluded secret/media fields. Unchanged AccountCard field allowlist includes all projected display fields. |

For F1 and F3, a fresh dependency-free source-extracted control-flow check was actually run: `node /tmp/n5-support-cold-review-delta-20261028-repro.mjs`, exit0. The corrected proof rejects simulated expiry at token-lock acquisition without writing proof; anonymous opening waits for asynchronous logout, and logout rejection prevents show. This uses synthetic SQL/browser doubles. It is not a PostgreSQL race, official vendor, React/browser, build or full-suite PASS.

## Partial-card change

ClipCard.tsx:10–12 adds an optional actionsFirst defaultfalse. The existing single action group is reused at30–37, rendered either before preview at41 or in its original body position at47. Existing disabled/availability, download, link and guest-consent callbacks are unchanged; the JSX does not duplicate the actions. VideoDetail.tsx:97–100 retains the partial-result notice and selects the new order only when status is done and clips_done<clips_total. Complete cards retain their prior order. globals.css:243–245 styles only direct-child action groups with wrapping, existing spacing tokens and flexible button widths.

The new tests/clip-card.test.ts:106–121 checks warning→actions→preview ordering, one available download action and complete-result ordering. Source inspection found no concrete regression in the bounded change. Interactive behavior, rendered360px layout and browser accessibility remain unmeasured by this review.

## Spec conformance

The verdict column applies to each whole acceptance criterion, including required executed gates. Because this is an isolated source-only review, runtime-dependent criteria remain unverifiable rather than being promoted to PASS from authored test existence. This does not mean the six source defects remain open; their resolved source evidence is recorded above. Runtime acceptance belongs to root.

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| AC-support-access-1 | unverifiable | Unchanged auth.ts/auth-store.ts retain bcrypt10, seven-day HMAC cookie authority, tenant identity and signup-only trial grant; proof/reset changes do not add grant paths. Complete compatibility/runtime regression not executed here. |
| AC-support-access-2 | unverifiable | Original closed mail configuration and validated TLS/deadline4-send/no-retry/postcommit source remain unchanged. TLS/STARTTLS/SMTP boundary tests and deployment behavior are unobserved. |
| AC-support-access-3 | unverifiable | F3 corrected with post-token-lock DB-clock checks for both sessions and specific issuer/confirming PostgreSQL cases. Other account/email/purpose/digest/TTL/one-use predicates remain. Actual cross-device/race results are unobserved. |
| AC-support-access-4 | unverifiable | Uniform202 forgot after-response scheduling and atomic reset/session/token revocation remain unchanged; no new credit/proof/login path added. Runtime forgot/reset/login regression not executed here. |
| AC-support-access-5 | unverifiable | F3 post-lock expiry gap corrected; prior strict body/origin/admission/cap/pruning/fragment/response controls remain unchanged. Full real-PG concurrent and mutation acceptance unobserved. |
| AC-support-access-6 | unverifiable | Membership/session SSR/API/transaction guards and privileged UUID/actor/reason audited command remain unchanged; new diagnostic SQL stays behind supportOperator. Runtime unauthorized/revoke cases not measured. |
| AC-support-access-7 | unverifiable | F4/F5/F6 corrected with explicit stage, full-precision stable cursor and combined bounded debit/grant history; projections retain safe fields and ownership. Targeted tests exist but actual DB outcomes and full read-only gates are unobserved. |
| AC-support-access-8 | unverifiable | F1 identified→anonymous boundary corrected with awaited cleanup, failure handling and no JWT request; server claims remain verified/current/UUID-bound60s HS256. Local A/B browser assertions updated. Vendor matching and an explicit legacy-contact fixture outcome are not established by this source review. |
| AC-support-access-9 | unverifiable | F2 accountId exposure removed from every context DTO; ownership, safe fields, preview consent and ordinary staff deep-link authority retained. Actual route/browser denial results are unobserved. |
| AC-support-access-10 | unverifiable | Anonymous cleanup now handles asynchronous logout failure; original logout/reset/erase/focus/visibility invalidation and independent-vendor-lifetime disclosure remain. Actual lifecycle/deployment retention checklist acceptance not executed here. |
| AC-support-access-11 | unverifiable | Same-page anonymous transition and staff360/1440 dark/light checks added to browser script; partial card keeps warning/actions order and adds source markup regression. Full native tests/lint/build/PG/mutations/responsive/lifecycle receipts are outside review and were not read. |

## Limits and handoff

No concrete introduced finding remains from this bounded source pass. Runtime tests, red/green mutation results, actual PostgreSQL races, SMTP/TLS boundaries, browser responsiveness/accessibility and native lifecycle gates must be evaluated by the coordinator against the exact candidate. Source-review completion does not establish those results. Real delivery, vendor contact/history/revoke/retention/erasure and RU deployment remain deferred by the frozen specification.

No code writes, dependencies, services, network, secrets, deployment, push or delegation were used. Only fresh requested /tmp report/trace and a dependency-free synthetic reproduction were created. Scope profile: model-routing-econom independent substantiveXL security delta, one pass within10min. Family codex is known; exact host-confirmed model/effort/tokens/cost are unavailable and null. Start observation03:01:47UTC; elapsed is recorded in the terminal trace. Root retains ownership of runtime acceptance and telemetry.

Status: completed
