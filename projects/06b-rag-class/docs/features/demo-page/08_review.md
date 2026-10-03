# F12 independent source review — review-1

Verdict: **REQUEST_CHANGES**. One confirmed medium test/regression-gate defect; no confirmed production correctness defect in the bounded source inspection. This is a completed review, not feature acceptance. Full regression is red; real-PG and actual browser/HTTP acceptance remain unverified.

Run-ID: 20261003T021046Z-demo-page  
Work-Unit-ID: demo-page-review  
Attempt-ID: review-1  
Source-Revision: 24d7e6fb85c425347ae31205f43888575e84594c  
Build-Revision: none  
Launch-SHA256: c98e090dea2ef3e6e9ea529a02c825d14ebaad231eb6968c3bb0c27f3f4dd3fd  
Snapshot-SHA256: 59bdd808a5ace6d3975826c9ba622f83a80db39e5525fdd39e06121b1114ff04

## Independent obligations, established before author report

Read root/project CLAUDE and relevant local security, model-routing, telemetry, risk, testing, operation-order and shared-resource rules. Requirements/architecture were read before `01_plan.md`, `02_validation.md`, and `05_completion.md`; the author report was not the acceptance oracle.

1. Specification FR-n6b-12 / SC-US-012-1,2 and ADR-009 require a saved, published, explicitly enabled bot, resolved by stored slug, with indistinguishable closed/unknown lookup. No anonymous URL ingestion and no dependency on widget allowed_origins.
2. SC-US-012-4, Demo page step 2 and ADR-007 require actual HTML noindex/no-store/frame-ancestors none/DENY, including closed-page handling. Header configuration alone cannot establish browser frame blocking or final Next header precedence.
3. SC-US-012-5, Demo page step 3a and Refinement require JSON plus normalized own Origin before quota/provider work; absent/null/foreign Origin and simple forms fail closed. The demo API must not grant CORS.
4. SC-US-012-3, Answer question and ADR-010 require existing HMAC visitor identity, shared widget/demo visitor/bot/global admission, atomic counters before calls, bounded provider calls, safe refusal/contact, and no widget-install metric mutation.
5. SC-US-008-4 and Architecture require server privacy before enabled input, server badge policy, public DTO without account authority/secrets, text rendering and DB-resolved citations.
6. Owner enable/disable must be an authenticated tenant operation, with stable stored server slug and no body-controlled identity. Cabinet/CTA must use a successfully saved active link. Existing publication and referral/metric seams must remain valid.
7. Applicable local gates require a meaningful fixed-test mutation, shared-resource concurrency, complete regression and actual UI acceptance. Pending runtime evidence is not a pass.

## Confirmed finding

**F12-R1 — Medium — F11 matcher assertion is incompatible with the F12 middleware change, making mandatory regression fail.**

- Changed location: `apps/web/src/middleware.ts:14`, matcher now `['/', '/b/:path*']`.
- Failing shared-seam assertion: `apps/web/tests/unit/referral-cookie.test.ts:18`, still `expect(config.matcher).toEqual(['/'])`.
- Observed reproduction: coordinator's saved `tests/artifacts/demo-page/final-full-regression.txt`, lines 157–204, records the actual `npm test` / Vitest regression: 35 files passed, one failed; **608 passed / 1 failed**, tests container exit **1**. Failure is the expected/received matcher array, not setup failure.
- Impact: DEM-07/full-suite acceptance cannot pass, and the chained PG gate has no completed result in this artifact. This is a current test-contract defect, not evidence that first-touch attribution itself is broken. Cookie/header assertions before line 18 pass; the new pathname guard returns before referral processing for non-root pages.
- Minimal correction: reconcile the F11 matcher expectation with the intentional demo matcher, retain root first-touch assertions, and directly assert that `/b/<slug>?ref=<valid>` returns no referral Set-Cookie while retaining no-store. Do not remove demo cache protection or weaken referral behavior checks merely to restore green. Run affected tests and required full regression after that correction; freeze a new source map including the corrected test.

## Source and test challenge results

| Obligation | Inspection and evidence | Remaining boundary |
| --- | --- | --- |
| Stored lookup/404 | `packages/db/src/demo.ts` validates a bounded slug and parameterizes SQL with both published/enabled predicates. SSR and API use this reader. No client bot/account selector. | Actual GET/404 status still requires HTTP evidence. |
| JSON/origin before costs | `demo-handler.ts:17–43` checks media/serialized Origin before lookup, body and admission; validates byte/question/IP bounds; no access-control headers. API OPTIONS denies. | Unit evidence passes; real-PG counter assertions authored but not observed executed. |
| Shared costs/logging | Demo passes visitor channel, stored bot ID, same visitorKey and `logChannel: demo` into unchanged AnswerQuestion/PaidGateway. Gateway derives all visitor/bot/global keys before calls. No demo call to widget-install writers; question log has null origin host. | Two authored 50-way PG races require 3 successes, 47 refusals, 6 total embed+generation calls and used=3 for visitor and bot limits. They invoke actual handlers/gateway/PG, not mocked admission. Execution pending. |
| Public privacy/rendering | `demoView` exposes name/contact/privacy/badge only. SSR passes config before textarea activation. React text rendering and http(s)-only citation href handling reject active schemes. Existing badgeRequired decision is reused. | Static rendering tests are not desktop/mobile browser acceptance. |
| Header/middleware seam | Global DENY/nosniff/referrer headers retained; demo config adds robots/cache/CSP. Middleware covers root and demo, with non-root early return and private no-store. Page is force-dynamic; no loading boundary found in app ancestors. | Final Next HTML/404 Cache-Control, iframe denial and no-question behavior must be observed. Matcher test defect F12-R1 confirmed. |
| Owner persistence | `publish.ts:22–32` uses one tenant transaction/UPDATE, explicit account predicate, cryptographic server slug and COALESCE. Existing unique constraint and row serialization support stable concurrent allocation; disable retains DB slug while hiding it in DTO. Existing handler validates session/origin/contact/payload and ignores client slug. | PG foreign-owner, legacy-null, disable/re-enable and 8-way locked concurrent saves authored; execution pending. |
| Saved UI link | Publish form exposes explicit checkbox; saved response determines path. Parent shares saved path with sandbox; disabled state points to publication setup. Unsaved edits do not invent a link. | Actual enable/save/reload/disable/CTA browser flow pending. |
| F09/F11 compatibility | Widget handler, quota gateway and install writer remain unchanged. Referral cookie branch remains root-only. Demo does not write installs, including existing-row path in authored PG case. Cabinet publication fields are additive. | Complete regression currently fails at F12-R1; no claim of global regression freedom. |

No new schema/dependencies or provider path were introduced. Existing schema already has unique nullable demo_slug and tenant bot UPDATE rights. No anonymous crawling, donor N6 reads or new attack experiments were performed. Atomic slug collision failure is fail-closed; adding a speculative retry engine is not required for this review.

## Evidence verification

- Computed exact-byte hashes of all **24** mapped files: zero mismatches. Recomputed canonical sorted compact JSON map digest equals the launch snapshot. HEAD and launch-file SHA256 match the brief.
- Saved local typecheck shows no diagnostics; author receipt records exit 0. Saved focused suite shows **122/122** tests passing across seven files, including widget, publication and quota guards. These are inspected author results, not reruns by the reviewer.
- Media mutation is meaningful: seven fixed invalid-media cases fail at the status assertion, receiving 422 instead of required 403. Tests are collected and execute; this is not a setup failure. The same 34-test suite then passes after restore. Mutation metadata's original/restored source digest is identical and matches the frozen file; fixed test digest also matches the map. Later lookup/admission assertions are not reached in the red cases, so the red result specifically proves the media rejection contract.
- Coordinator regression artifact observed terminal failure at 2026-10-03T02:33:39Z: **608/609 pass, exit 1**. No completed PG suite or actual UI receipt was observed. Image existence alone is not a verified build/acceptance identity for this review.
- Reviewer ran read-only source/evidence inspection and SHA checks only: no test probes, Docker, port binding, network, paid calls, child agents, product edits, commits or push.

## Delivery and telemetry

Profile: `compact-quality-first-v2`. Substantive risk is new public route L, with the documented fresh-SPARC M exception retaining mandatory checks; saved implementation mechanical route is M/exit 0. This review is one bounded independent attempt, maximum 480 seconds inclusive. Project-work-companion applied for source/evidence handoff; E2E preflight is `not_applicable` because this reviewer did not run E2E.

Requested model/effort: `gpt-6-astra` / medium. Brief identifies executor as Sol 6.1/high; independently exposed native actual-model/effort evidence and usage are unavailable here. Coordinator must reconcile actual metadata; this receipt does not claim an Astra execution or model switch. Tokens, cost and active time are null/unavailable; no savings claim.

The coordinator owns `docs/telemetry/p-replicator/20261003T021046Z-demo-page/{run.json,events.jsonl,work-record.json}`. Only this review report is manually written. CLI captures final source-bound receipt at `docs/telemetry/p-replicator/20261003T021046Z-demo-page/evidence/review-1-receipt.md`; Finished-At and elapsed are supplied in that terminal receipt. Final receipt completion means bounded review finished even though verdict is REQUEST_CHANGES.

Next accepted-scope work: correct F12-R1, rerun required regression/PG on a newly frozen snapshot, then perform authorized actual HTTP/browser gates with source/build-bound evidence. Until those gates pass, F12 is not accepted and runtime headers/UI must not be reported as verified.
