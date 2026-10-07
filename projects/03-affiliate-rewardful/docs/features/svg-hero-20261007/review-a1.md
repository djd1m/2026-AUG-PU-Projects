# Independent frozen review — Круг / project03

Run-ID: 20261007-svg-hero-03
Work-Unit-ID: 03-review-a1
Attempt-ID: 03-review-a1
Source-Revision: 732df4cccca8cd03bdaa51eaafe49adac23f01ee
Build-Revision: null (native SVG/README presentation; no runtime build)
Launch-SHA256: ff873e118cbc8c8a48cf7f89ecb83cf57d0f705ef38d8a5dce9c41980749c33f
Started-At: 2026-10-07T21:51:37.203178+00:00
Finished-At: 2026-10-07T21:56:57.547834+00:00
Verdict: FAIL — one mandatory actual second-branch movement proof remains unmet
Profile: model-routing-econom
Requested-Model: gpt-6.1-sol
Requested-Effort: high
Actual-Model: null
Actual-Effort: null
Usage: null
Cost: null
Duration-Seconds: 320.345
Measurement-Gaps: authoritative host model/effort/usage/cost/quota metadata unavailable; requested parameters are not execution proof.

Inputs were the planner, frozen manifest, launch, mandatory root/project instructions, directly relevant source files and frozen browser evidence. No author conversation, notes or author receipt were read. Browser was not rerun. Only this terminal receipt is written. No source/assets/telemetry, providers, DB, builds, publishing or children were changed/run.

## Frozen identity

Source-root HEAD independently equals the expected source revision. Recomputed digests match:

- Planner concept.md: eb98bcdf099703c26da8e6e16f4d937e1c347576edc55dae5a694631e0bdf094.
- review-a1-manifest.json: 5324ae7dcb16e10648c79ae18032bc99c4b7476ce2d29b40e9f82eb775fd0092.
- SVG: 15291af0178a99424cbd076c13b5270b76634a9276292bc75adb8ab9745d4235.
- README: e8ad0b448b650cdb7f4508fb48c819807e8c6dbbcc4ed69a0d39ef8fcd88d139.
- browser-a1/report.json: f386237e8d47df2fa3393a82b452a55582e874862ee2a955c08d93b5e4e831e6; sourceSHA256 exactly matches this SVG, unit03-browser-a1, finished2026-10-07T21:54:20.714Z, aggregate pass=false.

## Finding M1 — required second-branch proof fails

browser-a1/report.json case img-light-900-no-preference fails widgetPhaseMovement=0. Its nominal8s sample was captured at elapsed8.148s:137 marker pixels, centroid(517,835). The nominal8.4s sample was captured at elapsed8.576s:0 marker pixels and null centroid. Actual PNGs confirm the refund-rail marker is present in the first and absent in the second. Zero here is a missing-centroid fallback; it does not show a stationary marker.

SVG refund-travel moves vertically during70..83% and horizontally83..85%; it fades85..86%, hides86..88%, then resumes below the refund card. Nominal8.4s is within the moving visible phase, while the delayed8.576s capture is within the fade. This is a timing-sensitive failed mandatory observation, not evidence that the second branch never moves. The independent report and screenshots cannot support PASS for the planner's required visible/moving8/8.4s pair.

Remaining AC: actual raw IMG second-branch samples with a visible marker in both frames and measurable within-branch movement. A bounded focused proof can address this; no blind full-matrix repeat is needed. Proposed7.2/7.6s samples are safely inside the same phase but differ from the planner's explicit8/8.4s criterion. Coordinator must retain this raw FAIL and explicitly reconcile that timing criterion if using changed sample times; a different-time proof must not silently be called the original8/8.4s pass. Receipt verdict remains FAIL pending that proof/reconciliation.

Failure frame digests:8.png=4cdb0ca961f8d273f91eb870af6d673df710f4c1a82a671f261f0a6ac8c6e7a1;8.4.png=df98d31846e06119e3df7f1001fa1af25e19f9290d501bedff6f1baba6d574ae.

## Passing static/source checks

Product claims and card labels agree with actual implementation. shared/domain/events.mjs:8 requires verified confirmed events; attribution at24..37 resolves personal link/promo and enforces eligibility;85..93 earns by program rule only on confirmed payment and records confirmed_payment. reverse at39..54 adds separate negative refund entries and preserves historical payment facts. shared/domain/referral-attribution.mjs:5..32 trusts verified payment binding and recurring policy. variants/c-partner/app/views.mjs:44 states the same payment/refund semantics,65 displays payment/reward with ledger reasons,93 exposes personal link and promo. No claim of automatic bank payout, registration earnings or accepted live-money integration appears in the inserted text.

Chronology is explicit: shared recommendation/payment prefix, separate commission and possible later refund rails into the cabinet; visible “Если возврат подтверждён позже” and desc explain optional post-payment refund. Existing implementation also handles out-of-order refund delivery; this illustrative later-event path does not assert that all ingress events arrive chronologically. Six labels are persistent and both rails remain visible without animation.

README comparison to baseline shows only the six-line top insertion: linked image with meaningful alt plus three accurate properties. Existing text, including deployment caveats, is preserved. Asset exists in integration. docs/demos/index.md exists in source and is tracked at baseline blobee92c8d2cd13dea1eee6fb0a148f770869a423c4; sparse integration checkout omits that preexisting guide, so link existence was checked against canonical source. git diff --check on scoped asset/README returns0.

SVG XML parsed successfully;7546bytes, six card rects, native text/path/shape content, title+desc IDs match aria-labelledby, lang=ru, responsive viewBox and max-width100%/heightauto. All url() references resolve locally to#arrow. Read-only in-memory guard found no script/event handlers/external resources/fonts/embedded raster/Base64/foreignObject/DOCTYPE/entities. A script-added in-memory negative mutation was rejected by that guard. This guard is a focused review check, not a claim of running an author validator.

CSS defines10second infinite travel and distinct40..65% commission/65..98% refund phases. Reduced-motion uses animation:none!important with static visible markers; no weak pulse. VariantA app/styles.css:1 confirms navy#172f3f, sky#eaf6ff and orange#ffb547 palette lineage. Light accent darkens to#8a4b00 for contrast.

## Browser and visual scope

Eight direct cases pass (light/dark360/900, normal/reduce); reduce has no moving markers. All direct sample and DejaVu fallback geometry reports have empty overlap/card-outside/text-outside/marker-text-overlap lists and no viewport overflow. Four raw normal IMG cases include three passes and M1 above; first branch movement at5.5/5.9s is159.163px in the failed light900 case.

Four main raw IMG reduce cases fail under shared-WS emulation and are explicitly emulationDiagnostic=true. They must not be reported16/16. Separate native Chromium --force-prefers-reduced-motion cases pass4/4, nativeMatchMedia=true and0 changed pixels between1/4s for both schemes and widths. These establish the native reduce proof separately from failed host-emulation diagnostics.

Actually inspected03 PNGs: light/dark360 normal4.3s; light9005.5/8/8.4s; dark9004.3s; native reduce light360 and dark900. At360 the smallest19-unit copy scales to about10.7pixels: compact but readable in these raster views; cards and labels have visible margins with no clipping or misleading rail/text intersections; rail markers remain separate from text. At900 all labels and optional-refund explanation are clear. Native reduce still shows all six cards and four markers outside text. No additional visual blocker found.

## Project02 visual supplement only

Read only previous02 browser-a1/report.json and four actual normal PNGs: light/dark3604.3s, light9005.5s, dark9004.3s. Report binds SVG6554c9b6e7e5b5e45524e97d8abadcaa059a4a000381a284f55ff82451d4075b. The actual light palette is pale blue/white with deep navy text; dark is deep navy with blue cards and light text. Both widths are readable, labels fit cards, and the visible marker sits on a separate branch rail. No visual supplement finding. This does not re-review02 source or product claims. Its raw emulated reduce4 failures remain diagnostic; separate native reduce4 passes are not an emulated16/16 result.

Status: completed
