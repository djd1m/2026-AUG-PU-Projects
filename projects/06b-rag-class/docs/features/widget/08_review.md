# F09 independent source review — review-1

## Independent obligations (derived before reading the plan/author handoff)

Sources: Specification FR-n6b-7/8/9, SC-US-007-1/3, 008-1..4, 009-1..3; Pseudocode “Widget ask gate” and “Widget config and badge decision”; Architecture public/widget/DB boundaries; ADR-006/007; Refinement security, metric and lazy-loading requirements.

1. The published bot's server-owned allowlist gates config, ask, event and OPTIONS. Missing/null/foreign Origin and an empty allowlist fail closed without CORS or paid work; unknown/unpublished bots return 404. Allowed responses, including errors after the gate, retain exact-origin CORS, Vary and no credentials.
2. The existing PUBLIC_BASE_URL-derived script snippet must load one autonomous bundle, at most 30 KB gzip. Shadow DOM and adoptedStyleSheets isolate rendering without inline script/style or additional stylesheet permission. Actual foreign-origin CSP/CSS/CORS behavior requires browser evidence.
3. Validate bounded JSON and a 1..500-character question before the existing paid gateway. Derive ownership, widget channel and visitor identity on the server using the final trusted XFF address and existing HMAC prefix logic. Preserve semantic answers, safe citations, refusal/contact and error outcomes.
4. Render the server privacy notice above the input before the first question; keep input disabled until valid config arrives. Render model/source text as text and restrict citation links to safe protocols.
5. Decide badge requirement on the server using exact planOf and active removal. Free/unknown plans require the badge; construct its URL on the server. Refinement explicitly requires the badge when the bubble is shown. Restore deletion/hiding inside the shadow root with observer plus a two-second check; record tamper and at most one impression per page load.
6. Reuse one metric-host normalization for config/page/question. Insert eligible config atomically once per bot/host; mark only existing installs on the four successful semantic outcomes. Exclude test/operator/own/local/IP/preview hosts and rejected questions; concurrent questions must not overwrite the first timestamp.
7. Keep runtime free of the build-only TypeScript dependency. Distinguish source review/local evidence from full build, real PostgreSQL and browser acceptance. F10 click/referral/removal intent and F11 operator reporting are explicitly deferred, not missing F09 implementations.

## Reviewed identity and scope

Run-ID: 20261002T223848Z-widget
Work-Unit-ID: widget-independent-review
Attempt-ID: review-1
Source-Revision: 39464ac3c4ac77afd43bf1c15859398b7dd42b12
Source-Snapshot-SHA256: 68c3f4a92f6f814a70a31b6b1839994c324ceece2637a08fcd402f633c97cb48
Build-Revision: none
Launch-SHA256: 62df545c7025d00ba78142ea32d3c988fc64daf71a408fa4b1b00b97d954b4eb

Reviewed all 19 source/test/build entries in `tests/artifacts/widget/implementation-source-hashes.json`:

- Client/build: `apps/widget/src/index.ts`, `scripts/build-widget.mjs`, `apps/web/next.config.mjs`, `tsconfig.json`, `.gitignore`, `tests/artifacts/widget/deny-typescript-loader.mjs`.
- Public routes: `apps/web/src/app/api/widget/{ask,config,event}/route.ts`; server `widget-handler.ts`, `widget-policy.ts`, `metric-host.ts`, `runtime.ts`; `apps/web/src/app/cabinet/publish-bot.tsx`.
- DB: `packages/db/src/widget.ts`, `packages/db/src/index.ts`.
- Tests: `apps/web/tests/unit/widget-handler.test.ts`, `apps/web/tests/int/widget.int.test.ts`, `apps/web/tests/int/widget-fixture.ts`.

Also read the reused Origin/JSON/address/answer/publication seams, Docker build-copy boundary, embed contract, and then `01_plan.md`, `05_completion.md` and local evidence. Snapshot identity/current hashes are supplied by the coordinator; this attempt did not rerun source-hash verification. No donor N6, children, network, tests, probes, simulations, product edits or telemetry writes. Only this report is written; CLI owns the separate terminal receipt.

## Finding

**F09-R1 — P2: Required branding disappears whenever the chat is collapsed.**

Location: `apps/widget/src/index.ts:71-72` (badge appended to panel), with `:27`, `:39`, `:67-68`, `:106-107`, `:123` establishing the visibility/event path.

Reproduction from source: load a published Free bot on an allowed external page and let config succeed without clicking “Открыть чат”. The panel starts with `hidden=true`; `[hidden] { display:none !important }` hides its entire subtree. `newBadge()` appends the required badge inside that panel, while the visible toggle is its sibling. Therefore the visible initial bubble has no “Работает на N6b” badge. Closing an opened chat hides branding again. `showImpression()` also explicitly suppresses the event while the panel is hidden. A descendant's `display:block !important` cannot override its ancestor's `display:none`.

This conflicts with SC-US-009-1/FR-n6b-9 and the explicit Refinement lazy-loading sentence at lines 85–86: config is requested immediately because the badge is needed when showing the bubble. The plan/author report does not authorize changing that canonical requirement. This is a deterministic DOM/CSS source defect, not a claim of having executed a browser test.

Required correction: keep required branding visible with the bubble independently of panel open/closed state; align restoration and impression handling with that placement while retaining page-wide impression deduplication. Add/check the collapsed-after-config and collapsed-after-close cases in the already-required foreign-origin UI verification, alongside open-panel tamper restoration and paid-removal absence. Do not expand this into F10 click handling.

## Other source conclusions and test adequacy

No additional concrete defect found in the bounded pass. The shared gate validates a singular bounded query ID, looks up only published bots, rejects malformed/nonallowlisted Origin, and emits CORS only after authorization. The query ID is explicitly documented for bodyless preflight; optional body ID must agree. Validation precedes address derivation and AnswerQuestion. Output config selects public fields rather than serializing internal account/plan data. Allowed-path 422/413/429/503 responses preserve CORS; lookup failures cannot claim an authorized Origin.

The existing AnswerQuestion type and implementation make status 200 exactly the four accepted semantic outcomes, so the first-question update matches the obligation. SQL uses ON CONFLICT DO NOTHING and first_question_at IS NULL, rechecks test/operator ownership conditions, and never creates an install from an ask. Unit tests exercise gate/policy/validation/exclusions; authored PG tests exercise real gateway provenance, accepted/failed outcomes, config concurrency and first-timestamp preservation. Their execution remains pending.

The client uses textContent/DOM nodes, filters citation schemes/credentials, and disables input until privacy-bearing config validates. Server badge policy and future-F10 destination match ADR-006. Observer/periodic restoration handles the inspected badge attributes, removal, internal stylesheet replacement and relevant internal ancestors, but does not cure F09-R1. The focused suite tests server badge policy, not initial client badge visibility; it therefore cannot detect this finding.

The build helper typechecks the self-contained IIFE, checks gzip size, removes stale output on diagnostic/cap rejection and writes one JS asset. Next config imports it only for production-build phase; no widget runtime imports were found. Docker copies the generated public directory. Full production build/runtime/browser behavior is not inferred from these source facts.

Existing evidence inspected (not rerun): typecheck exit 0; five focused files/128 tests green; final bundle 12,223 bytes/3,824 gzip bytes; cap rejection exit 1 with exact restoration; production-server config resolves with TypeScript imports denied. The latter is a config seam check, not a complete server launch. The cap probe predates a later legitimate client change; final build proof separately binds final source/artifact.

`mutations.json` contains meaningful semantic failures: disabling the shared Origin guard yields 200 instead of 403; forcing badgeRequired false yields false instead of true. Both report changed hashes, exact original-byte restoration and identical-command green exit 0. The Origin selector fails on the first config iteration of the shared-gate test; it is not separate mutation evidence for every route. Original tests/source cover the shared path. These mutations do not establish DOM restoration or visibility acceptance.

## Verdict and handoff

**REQUEST_CHANGES** for F09-R1. This bounded review is complete; feature acceptance is not.

After the targeted correction, coordinator gates still include full unit regression, real PostgreSQL tests, full production build/immutable image evidence and actual foreign-origin browser verification under restrictive CSP/hostile CSS at 390/1440. Pending gates alone are not reported as source defects. No browser behavior or deployment acceptance is fabricated.

Profile: compact-quality-first-v2; substantive L with the existing fresh-SPARC M exception and mandatory checks preserved. Requested reviewer: gpt-6-astra/medium; author requested gpt-6.1-sol/high. Actual native model/effort/usage/cost: null, because this worker has no confirming native tool metadata; coordinator must reconcile. No model switch or measured savings is asserted.

Launch time from coordinator metadata: 2026-10-02T23:04:12.839054+00:00. Finish time and elapsed wall duration are recorded in the terminal receipt; active time and token/billing counters are unavailable. Coordinator telemetry: `docs/telemetry/p-replicator/20261002T223848Z-widget/{run.json,events.jsonl,work-record.json}`. Project-work-companion used for source-bound handoff; E2E preflight is not_applicable to this read-only source review.
