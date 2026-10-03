# F10 independent source review

Run: `20261003T000534Z-badge-referral`; attempt: `review-1`.

## Independently derived obligations (recorded before author report)

Canonical inputs: Specification FR-n6b-9/10/11 and SC-US-010-1/011-1/011-2; Pseudocode “Widget config and badge decision” and “Badge click and referral”; Architecture account/BadgeEvent/GrowthEvent and service/tenant boundary; Refinement family self-referral limitation.

1. Resolve public badge IDs server-side; unknown IDs redirect to the fixed landing without ref. Existing IDs produce a 302 with ref and badge source, recording a visitor/bot/day-deduplicated click. Visitor identity must use trusted IP HMAC, not stored raw addresses.
2. Landing sets n6b_ref only when absent, for 30 days, without renewing/replacing an existing first touch. Attribution is resolved server-side into the existing account FK.
3. Signup account, attribution and session must commit atomically; invalid/deleted referral cannot break ordinary signup, email conflict must not create an orphan account/session, and request bodies cannot choose account/referral authority. Existing authentication gates remain intact.
4. Authenticated studio creation excludes referrals from its own account or children, including the race-sensitive relationship lookup. Separate anonymous signup from the same browser is deliberately not recognized as self-referral. F13 must consume the shared resolver in its creation transaction; its not-yet-existing route is outside this bounded F10 review.
5. The Free cabinet offers “Скоро: ~990 ₽/мес, оставьте заявку”, records badge_removal_intent once per account/day even concurrently, and does not change plan or badge state. Existing badge rendering/validation remains compatible.
6. Reuse existing schema; no payment implementation. Review test semantics against actual database effects and UI flow, distinguishing authored tests from executed evidence.

Execution restricted to source inspection; no tests, probes, network, product edits, commits or child agents. E2E readiness: not_applicable to this source-only attempt. Telemetry remains coordinator-owned; only this report is writable.


## Verdict

**ACCEPT_WITH_CAVEATS — bounded source review completed; feature/runtime acceptance remains pending.**
No confirmed blocker/high/medium/low source defects were identified in this snapshot. Pending coordinator checks are not counted as defects or passes.

## Source identity and coverage

Independently recalculated the SHA256 of every one of the 17 source/test files in `tests/artifacts/badge-referral/implementation-source-hashes.json`: all match. Recalculated sorted file-map snapshot: `4f6cfc242b7863ba0f586b07a46b3cdbcd24cbb0d10360895c90679c11a94dff`. HEAD is `4a4f602cda39954900365d3ba7085db7c4d732b3`. Launch digest independently matches `c0b8be4827e6b0819a2ac2196e7d494fc26119d4fd6fdddbc2e71a8ae14b5a6e`. Build revision: none.

Read all 17 files, relevant tracked diffs, existing transaction/IP/day helpers, schema constraints and grants. No schema, payment, dependency or widget-behavior expansion is present in the reviewed source. Canonical obligations above were written before reading 01_plan, 02_validation and 05_completion.

| Obligation | Source assessment |
| --- | --- |
| Click / REF-01 | `referral-handler.ts` constructs the target from configured PUBLIC_BASE_URL, not request next/host; invalid and missing bots redirect without ref. `recordReferralClick` uses existing last-hop trusted-IP policy, HMAC prefix+bot identity, Moscow day, and the exact existing partial-index conflict predicate. Service transaction and bot key-share lock prevent deletion between resolution and click insertion. No publication gate added. Missing trusted IP deliberately omits recording, as planned. |
| First touch / REF-02 | Pure helper distinguishes absent from empty/invalid existing cookies. Middleware is scoped to `/`, sets HttpOnly/Lax/Path=/, production Secure and 2592000-second Max-Age only on first touch. No renewal occurs. Server middleware owns cookie mutation; force-dynamic landing and private/no-store middleware cover caching at source level. Actual production response behavior remains a browser gate. |
| Signup / REF-03 | Cookie is the only referral input. Existing Origin, address quota, validation and bcrypt ordering are preserved by the small auth diff. Resolver, account CTE and session insert share withService's BEGIN/COMMIT/ROLLBACK. Bot key-share protects FK insertion against deletion; prior deletion yields null. Email conflict inserts neither account nor session; session failure rolls account back. Login never rewrites referral. |
| Family / REF-04 | Resolver accepts an explicitly trusted actor parameter; public registration never supplies it from body or cookies. Source-owner equality and direct-parent equality exclude studio and child regardless of studio_access. Other families and anonymous standalone signup remain eligible. DB contract tests persist resulting attribution. F13 HTTP/UI wiring is correctly not claimed. See concurrency boundary below. |
| Intent / REF-05 | Same-origin and authenticated-session checks precede service write. Body cannot choose account/day/plan. Existing account row FOR UPDATE serializes concurrent requests; subsequent EXISTS/INSERT sees prior committed intent under the existing default transaction behavior. Moscow date is consistent with click handling. No plan/badge write exists. Free cabinet exposes the requested message and handles failed submissions. |
| Compatibility / REF-06 | Landing registration/login links and cabinet component are connected. PUBLIC_ID_RE was moved unchanged, retaining the widget-policy export; badgeRequired and existing widget/origin behavior are unchanged. UI rendering/click behavior is not established by static inspection. |

## Tests and evidence quality

The nine authored real-PG cases exercise actual handlers/store transactions and persisted rows: concurrent click uniqueness/day/prefix boundaries; missing-IP and unknown-bot behavior; cookie-only registration/login/email conflict; missing/deleted referral; session rollback; concurrent registration; bot deletion locking; family cases; concurrent intent and unchanged badge settings. They are meaningful behavioral tests rather than source-string assertions. They have not run in this review.

Unit tests use actual NextRequest/NextResponse for cookie behavior and mocked DB seams for HTTP authority/error boundaries. The client test checks the submission helper, not rendered React/browser behavior; it does not replace planned UI checks. Read the existing mutation logs: disabling first-touch protection gives 1 failed/9 passed; restored source gives 10 passed. The current helper/test hashes match the restoration artifact. Read the typecheck log, which records both root and web tsc invocations without errors. The 78 focused-unit pass remains author-reported in the structured check artifact; its complete native output was not independently rerun or inspected here.

## Explicit caveats and handoff

- Full frozen-source unit/regression, nine real-PG cases/full integration, production build, and real Docker/browser flow at 1440/390 remain mandatory coordinator gates. Browser flow must observe redirect, production cookie attributes/cache/no renewal, signup attribution, intent and unchanged badge. Source acceptance alone closes none of these runtime gates.
- `packages/db/src/referral.ts:12` locks `b` with FOR KEY SHARE, but does not lock source account `a`. It protects bot existence, not stability of `a.parent_account_id` through commit. Family classification therefore uses the relationship visible at resolution. Current F10 exposes no studio-create or reparent/handover route, and canonical requirements do not define a concurrent-handover ordering; this is not promoted to a confirmed present defect. F13/F14 integration must explicitly settle ordering against concurrent handover (Pseudocode permits clearing parent_account_id), add the applicable race case, and use stronger relationship locking if commit-stable membership is required. The existing bot-deletion test is not evidence for that different race.
- F13 must authenticate/authorize the acting studio server-side and invoke this resolver inside the child-creation transaction. The resolver is not itself studio authorization. Reachable SC-US-011-2 UI is still outside F10, not passed.

## Execution and telemetry

Profile: `compact-quality-first-v2`; inherited substantive M with fresh-SPARC exception to public-route L, all mandatory runtime gates retained. Reviewer requested `gpt-6-astra` / medium in launch; actual native reviewer model/effort and reviewer usage/cost are unavailable in this session and remain null. No model switch/fallback performed. Separate author native metadata in `evidence/implementation-1-native.json` records `gpt-6.1-sol` / high; those counters belong to the author and are not attributed to this review.

Only this report was written. No tests/probes, Docker, network, installs, product changes, commits, children or donor N6 reads. Read-only SHA/source checks were performed; runtime execution was intentionally excluded. Coordinator owns run/events/work-record and CLI owns the fresh terminal receipt. Telemetry path: `docs/telemetry/p-replicator/20261003T000534Z-badge-referral/`. Reviewer active time, usage, cost and time to accepted feature are unknown; savings are not established.

Review launch: 2026-10-03T00:29:23.070404+00:00; report finished: 2026-10-03T00:33:22.211121+00:00; elapsed from launch: 239.141 seconds, including reading and reporting.
