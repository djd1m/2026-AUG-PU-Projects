# N3 D agent independent review
Reviewer family: codex
Spec revision: sha256:b5e87047f8690a67e1ee18e262329086313633dfdbcc4f28b5acc11ac949f80f
Source revision: 0055e6f43a1282ea2677ab4e4d340cf0e8105f6e
Source worktree: /tmp/n3-d-ui-work (clean at final sample)
Started: 2026-09-09T07:23:24Z
Ended: 2026-09-09T07:29:38Z
Duration seconds: 374.416
Profile: compact-quality-first-v2
Requested model / effort: gpt-6-astra / high
Actual model / effort: null / null (execution metadata unavailable)
Usage / cost: null / null (not measured; no reconstructed counters)
Trace: projects/03-affiliate-rewardful/docs/telemetry/p-replicator/20260909T071850Z-go-d-agent in root main project
Outcome: no open consequential findings after the refund explanation fix.
Scope: independent read-only source review and isolated pure checks. No browser, WebDriver, server, Docker, production, or money calls. Browser/deployment acceptance belongs to the parent run and is not claimed here.

## Spec conformance

Verdicts describe source conformance supported by the focused pure checks below, not observed browser acceptance. Paths below are relative to projects/03-affiliate-rewardful.

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-d-agent-4011 / SC-US-401-1 — explicit read+draft grant; scope, subject, expiry; no payment/approve/send | met | app/state.mjs:1 role scopes; app/app.mjs:83 consent and direct grant.create; app/views.mjs:18 renders subject, actions, expiry, exclusions. shared/application/access.mjs:39 rejects excess actions. |
| AC-d-agent-4012 / SC-US-401-2 — expired/revoked protected step denied; owner remains independent | met | app/app.mjs:16 separates direct and delegated contexts; :44 preserves owner refresh after task read denial; :145 revokes without disabling owner actions. access.mjs:15 checks both clocks and revocation. application/index.mjs:56 authorizes before cached result lookup, :65 rechecks cached publication. Pure revoke/expiry denial and direct owner approve/export passed. |
| AC-d-agent-4021 / SC-US-402-1 — repeated logical prepare yields same artifact or explicit revision | met | app/app.mjs:96 persists logical task key and artifact ID, :109 refreshes possibly stale cached task.create status; app/state.mjs:8 preserves artifactId in recount. index.mjs:60 stores idempotency results per tenant/actor/action/key. registry.mjs:34 reuses ID and unchanged hash. Pure repeated task.run created one registry; logical key and generation checks passed. |
| AC-d-agent-4022 / SC-US-402-2 — refund changes amount and explanation; old approval invalid | met | Resolved D1 at 0055e6f. app/app.mjs:26 reads owner registry and dashboard; views.mjs:39 matches sourceVersion, payment membership and cash/refund entries; :45 exposes actual negative correction and original entry. Pure external refund changed 60000→55000, invalidated approval/export, rendered -5000 and exact payment/correction/original IDs without local UI receipt; stale snapshot suppressed correction attribution. |
| AC-d-agent-4031 / SC-US-403-1 — exact artifact approval and CSV; export causes no transfer | met | views.mjs:53 renders ID/revision/hash; app/state.mjs:7 builds exact reference; app/app.mjs:151 uses direct owner approve/export. registry.mjs:44 validates current hash, revision, source and approval before CSV. Pure old-source export denied; current approved export matched hash and transfers remained zero. |
| AC-d-agent-4032 / SC-US-403-2 — revoked agent leaves corrected artifact available to owner and A | met | app/app.mjs:44 owner read continues after delegated denial; :151 direct approval has no grant; :53 creates handoff from same artifactId. shared/client/api.mjs:53 preserves session and artifact ID in A handoff; server independent owner rights in access.mjs:8. Pure direct approve/export after grant revoke passed. Actual cross-port browser handoff not exercised by reviewer. |
| AC-d-agent-4041 / SC-US-404-1 — repeated own-status request preserves task/status without financial duplication | met | app/state.mjs:3 restricts partner to partner.read; app/app.mjs:96 explicit stable create key, then task.read refresh; dispatch.mjs:64 returns stored terminal task result; partnerRead filters own actor. Pure task result and repeated task execution preserved state; source idempotency path independently inspected. |
| AC-d-agent-4042 / SC-US-404-2 — late canceled T1 cannot finish T2; no rollback claim | met | app/state.mjs:12 checks both task ID and captured generation; app/app.mjs:116 stores late T1 separately; :98 retains canceled previous ID. views.mjs:35 explicitly limits cancellation and :36 separates late response. Pure cancel T1→create T2→run T1 returned canceled T1, rejected as T2 result; T2 remained pending. |
| AC-d-agent-4051 / SC-US-405-1 — own credit answer matches B, no other role cash | met | dispatch.mjs:47 maps credit task directly to credit.read; projections.mjs:31 uses actor-scoped credit ledger/reservations; views.mjs:64 renders returned available/held/reserved/applied/invoice and noncash/unknown-result explanation. Pure customer task result deep-equaled creditRead and contained no partner actor ID. |
| AC-d-agent-4052 / SC-US-405-2 — read-only reserve/apply denied; reading spends nothing | met | app/state.mjs:4 grants credit.read only; app/app.mjs:121 makes actual reserve attempt and verifies returned projection is unchanged after 403. access.mjs:31 enforces grant action scope before dispatch; core direct customer scope also excludes resolution. Pure reserve attempt returned GRANT_SCOPE, with balances/reservations unchanged. |

## Findings and resolution

D1 — MEDIUM, resolved: revised partial-refund result omitted a meaningful explanation. Initial views.mjs rendered names/amounts and unchanged exclusions only. Reproduction: prepare August (60000), approve, apply default partial refund, recount same artifact (55000). The three exclusions remained equal, and the final artifact view did not identify the partial refund/payment or correction amount. This failed SC-US-402-2 despite correct accounting and invalidation.

The first patch at 7fb54c600f95b53a843e0a01ff7100cddede6916 wrote a per-run/actor browser refundReceipt and rendered it in artifactView. That did not resolve D1: refunds made outside D lacked the receipt; its version came from a later dashboard read; wording demanded new approval even after approving the current revision. Those cases were sent to root and author. This was a correctness/conformance finding, not a demonstrated authorization bypass.

Resolved source: 0055e6f43a1282ea2677ab4e4d340cf0e8105f6e, variants/d-agent/app/views.mjs:39 and app/app.mjs:26. The replacement reads the owner dashboard, filters real cash refund ledger entries by payments appearing in the artifact, and requires exact sourceVersion alignment. It displays correction amount, payment ID, correction ID and original entry ID. Local refundReceipt is removed. Mismatched source versions explicitly require recount and do not attribute later entries to the old snapshot. Approval wording describes exact-version requirements without falsely declaring the current approved revision unapproved.

Independent follow-up assertions passed: default refund applied directly through core, no D receipt; 60000→55000; old CSV rejected with STALE_SOURCE; approval cleared by recount; -5000 correction rendered with all three stored references; reconstructed artifact/dashboard with empty UI state rendered identically; sourceVersion mismatch rendered stale explanation without correction rows; current approved artifact retained accurate wording; current export matched hash; transfers stayed zero.

## Other bounded review evidence

Read D PRD/spec/runtime, D app/state/views, shared access/dispatch/application idempotency and client, registry/projections and seed. Role selection exposes only actors in the existing session; each request specifies that actor. Server session membership is checked at application/index.mjs:49, before access and data dispatch. Partner/customer startup does not fetch merchant dashboard. Merchant dashboard is fetched only with an artifact or explicit lab opening. Task and grant references/keys are stored per run and actor; financial results are re-read. Task async responses are constrained by selected ID and generation. Buttons are locked during requests, errors have retry, lab activation follows successful owner read, and stale task results are distinguished from the current owner artifact. F1 runner, absent external MCP/A2A/LLM, and unknown usage are disclosed in taskView.

Pure authorized dispatch checks (authorize then dispatch, no database/network): grant revoke denies new task read while direct owner approve/export remains valid; wall/demo expiry denies next protected step; partner canceled T1 late response remains canceled and does not replace T2; customer result equals own credit projection; read-only reserve is rejected without changing balances/reservations. These do not substitute for PostgreSQL concurrency or HTTP/browser tests, which were intentionally not rerun in this review.

Node syntax checks passed for app.mjs, views.mjs and state.mjs. No edits to repository source. No open findings remain in the bounded source review; browser layout/loading/real retry behavior and deployed runtime hash remain parent-owned verification gaps.

## Artifact hashes

SHA-256, final child source:

- app/app.mjs: 8382309b68c74b6f83c0d6cf4dd9284b08194ac56b275d13dd6a9aa31be08d50
- app/views.mjs: 90f3e5e27bba48d3fc644d88d73d4f943dfb457ad7014d3ec58c4aea183f4fc3
- app/state.mjs: f7ae6db36bb542181860d5e0608cba7d010c56be4ad41e0c9e6b33d436deca17
- app/styles.css: 764c40e8904ed0bad7394e7fd5d55575186af743054870f88057ea2ebf52a445
- app/index.html: 636950e718b1d977abd98877b26536c79a5b21d16493780b9c2b8d2a8a2b8bae

All app paths above are under variants/d-agent. Runtime artifact hash: null (reviewer did not deploy or inspect browser assets).

## Coordinator browser acceptance

Actual Firefox D: 13/13 tests (12 scenarios), desktop1440/mobile390, revoke/expiry, exact refund explanation, A handoff, B balance parity, cancel/late response and denied reserve. Full PostgreSQL44/44; current14 mutation guards killed. Source cb033a8 (child0055e6f). Actual reviewer Astra/high established later from provider logs in shared run evidence; original reviewer metadata gaps above preserve what was visible at review time. No real wire/payment/LLM acceptance.
