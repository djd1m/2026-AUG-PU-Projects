# Independent focused timing review — Круг / project03

Run-ID: 20261007-svg-hero-03
Work-Unit-ID: 03-review-a2
Attempt-ID: 03-review-a2
Source-Revision: 732df4cc+unchangedSVG15291af0178a99424cbd076c13b5270b76634a9276292bc75adb8ab9745d4235
Base-Revision: 732df4cccca8cd03bdaa51eaafe49adac23f01ee
Build-Revision: null (native SVG/README presentation; no runtime build)
Launch-SHA256: 9313625d93efe961d9e6561c48c51c8f2c569ccafe3ef73ca985ab79cb8b2998
Started-At: 2026-10-07T22:00:18.525551+00:00
Finished-At: 2026-10-07T22:04:10.014273+00:00
Duration-Seconds: 231.489
Verdict: PASS — reconciled source-phase timing and actual second-branch IMG movement proved
Profile: model-routing-econom
Requested-Model: gpt-6.1-sol
Requested-Effort: high
Actual-Model: null
Actual-Effort: null
Usage: null
Cost: null
Measurement-Gaps: authoritative host actual-model/effort/usage/cost/quota metadata unavailable; requested launch parameters are not execution proof. Duration is wall time from caller launch to receipt, including setup.

## Scope and identity

Fresh independent narrow review of the planner, frozen SVG/README, review manifest/launch, frozen original and focused browser reports, two focused PNGs, and native focused runner code. Prior independent review-a1.md is retained solely for already-passing static/source/palette/geometry findings. No author chat, notes, receipt, history or browser-proof-a2.md was read. Source-root HEAD independently equals Base-Revision. All eight manifest entries are regular, non-symlink files and their recomputed SHA256 values match. SVG and README match their prior review hashes. No asset, README, test, source, telemetry or full-browser runner was changed. No child, build, browser rerun, provider, DB, install, commit, push or publication was performed.

Planner-Path: /tmp/projects-svg-hero-worktree-20261007/projects/03-affiliate-rewardful/docs/features/svg-hero-20261007/concept.md
Planner-SHA256: 727f776124564d2de728763a92b17cde3159c20f28b71658a8fee056191b5bdd
Manifest-Path: /tmp/projects-svg-hero-worktree-20261007/projects/03-affiliate-rewardful/docs/features/svg-hero-20261007/review-a2-manifest.json
Manifest-SHA256: a81e9ce68a5be755548c9e1add9b357656ee24827869bf39ef197235f73dd4bc
Original-Report-SHA256: f386237e8d47df2fa3393a82b452a55582e874862ee2a955c08d93b5e4e831e6
Focused-Report-SHA256: fe55dfaa009c152ad145d4b0d5299432cbdeef267dec770c32665ebd0e131e7a
SVG-SHA256: 15291af0178a99424cbd076c13b5270b76634a9276292bc75adb8ab9745d4235
README-SHA256: e8ad0b448b650cdb7f4508fb48c819807e8c6dbbcc4ed69a0d39ef8fcd88d139
Focused-Runner-SHA256: c792e025e3b0cff14b4c823a0898326cf718b1782056cb4b19f1ec43f6015806
Refund-7.2-PNG-SHA256: 61dbd3418553ab591bf10c20d6a731eb6230cf49f9c81b6939c1efcaa32ab1e4
Refund-7.6-PNG-SHA256: 082dd7c72c60a3440c4eb9fdc089ed811fe14b85c5f009973efb9ede40900847

Inherited feature ROUTE is S presentation scope with mandatory real browser and independent review gates. This stage only reads evidence and writes its sole named receipt; no new implementation ROUTE or actual E2E applies. Companion readiness: not_applicable (no browser execution in this review). Telemetry remains coordinator-owned; no separate telemetry file was created.

## Timing reconciliation

The approved canonical planner explicitly replaces nominal8/8.4s with7.2/7.6s on the source-derived refund vertical phase, preserves the original failure, and prohibits a false emulated16/16 claim. Its observed filesystem mtime2026-10-07T21:57:31.687+00:00 precedes focused report startedAt21:58:50.405Z. This is local chronology evidence, not an independently signed historical timestamp. The caller-supplied approval applies to this exact planner SHA.

Direct SVG inspection confirms10s duration, linear timing, opacity1 throughout70..83%, and transform from(368,455) to(368,605): continuous visible vertical motion is7..8.3s. Origin is conservatively bounded by navigation start21:58:51.106Z and completed navigation+IMG decode21:58:51.285Z,179ms apart. Independently recomputing [captureStart-latestOrigin, captureEnd-earliestOrigin] yields:

| Target | Capture interval UTC | Conservative source-phase seconds | Marker pixels | Actual raster centroid |
|---|---|---|---|---|
|7.2s|21:58:58.489–21:58:58.688|[7.204,7.582]|134|(517,707.3656716417911)|
|7.6s|21:58:58.956–21:58:59.194|[7.671,8.088]|135|(517,789.2518518518518)|

Both entire conservative capture intervals are inside7..8.3s. Both actual PNGs were visually inspected: the same orange refund marker remains on the vertical rail, outside text, and moves downward. Independent core-Python PNG decoding and a source-bound rail ROI with marker-color tolerance reproduce both counts/centroids exactly, without relying on report.pass or the runner's baseline PNG. Their coordinate displacement is81.88618021006073px, exceeding1px. Independent whole-image comparison reproduces423 changed pixels, confined to x508..526/y698..799, covering the old and new rail marker positions. Source times inferred from rendered centroid positions are about7.416/7.921s and agree with the conservative bounds.

## Pixel-proof and runner safety

Runner baseline derives from the identical frozen SVG by adding display:none only to the exact marker group tags; it retains graph, text, palette and dimensions. markerPixels selects pixels changed relative to that hidden-marker graph and close to actual computed marker fillRGB(138,75,0), so fixed orange card numerals do not become marker observations. Positive counts alone would not establish movement; the required greater-than1px centroid displacement and independent spatial PNG difference establish coordinate motion, not merely opacity variation. No baseline artifact was added to the permitted review input set; independent raster checks used the two frozen PNGs.

The focused runner hard-gates SVG SHA and binds runner SHA in its report. It uses the existing loopback Playwright WS ws://127.0.0.1:9320/, creates its own context, and finally closes only that context. Four exact synthetic HTTP URLs are locally fulfilled from frozen bytes/HTML; all other HTTP requests are recorded and aborted. It closes matching page WebSockets when context.routeWebSocket is available; this guard is feature-conditional, not an unconditional availability gate. The frozen SVG and fixture HTML contain no script, external resource or page-WebSocket initiator, and report.unexpected is empty. No external URL is fetched, no new browser is launched, no browser.close() or process-kill affects the existing shared browser.

## Findings and retained matrix

Blocking findings: none. Prior review M1 is resolved for the explicitly reconciled7.2/7.6s acceptance timing. No new broad static/product review was performed; prior passing static/source/palette/geometry findings remain source-current because SVG/README hashes are unchanged.

Nonblocking precision clarification L1: original nominal8.4s elapsed8.576 equals85.76% on the nominal source clock. SVG fades85..86% and is fully hidden86..88%; therefore this observed time lies in the fade-to-hide transition, not already strictly inside the fully hidden interval. The planner's phrase “enters designed86% opacity gap” is shorthand for that boundary, not a precise phase assertion. Actual zero classified marker pixels and null centroid remain a failed observation; they are not evidence of a stationary marker. This wording does not affect either new source-phase interval or spatial proof.

Original browser-a1/report.json is byte-identical and still aggregate pass=false. Its8 direct cases pass;3 of4 original normal IMG cases pass; the light900 normal IMG case retains widgetPhaseMovement0 and its original8/8.4s failure. The focused source-bound pass supplies its remaining refund-motion proof at the revised timing; it does not rewrite the old case into a pass. Original first-branch proof and other normal IMG cases remain untouched. The4 raw host-emulated IMG reduce cases remain failed emulationDiagnostic=true. The separate4 native system-reduce IMG cases remain passed with nativeMatchMedia=true; prior independent receipt records0 changed pixels for1/4s. Acceptance is the retained direct/normal/native evidence plus this focused repair. No full16-case rerun or emulated16/16 success is claimed.

Checks performed in this stage: frozen SHA/regular-file/source identity, direct timing/keyframe/runner read, independent timestamp-bound arithmetic, visual inspection of both frozen PNGs, independent PNG centroid/displacement/raster recomputation, and retained full-report status inspection. No remaining required proof within this narrow reconciliation scope.

Status: completed
