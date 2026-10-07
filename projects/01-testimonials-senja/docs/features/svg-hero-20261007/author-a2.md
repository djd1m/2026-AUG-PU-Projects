# Project01 corrective SVG author receipt

Run-ID: 20261007-svg-hero-01
Work-Unit-ID: 01-author-a2
Attempt-ID: 01-author-a2
Source-Revision: 732df4cc+hero-SHA2564296d9f4559e095c3c20ffc607170b210ab66ce036d4610d674fe87abb76efdd
Build-Revision: null
Launch-SHA256: b9af13ba8b5644e641845b81b6bb4d230a0e18d302511a8e216a4d60baefedda
Planner-SHA256: bb701a120c6014acb408f8fea11917e0039a139112dedb97c41915d3c50d2343
Finished-At: 2026-10-07T21:24:54.224915+00:00
Verdict: PASS for bounded corrective implementation/static checks; browser acceptance is coordinator-owned.

## Corrected findings and scope

Read approved concept, independent frozen review-a1.md (assignment's independentreview-a1.md alias absent; actual review-a1.md found) and browser-a1/report.json. M01 fixed with SVG display:block;max-width:100%;height:auto, preserving640×650 viewBox and proportional intrinsic size. M02 fixed by shorter moderation label “Одобрите отзыв”, wall caption “Страница отзывов” and widget caption “Блок на сайте”. Text remains at least19px viewBox. Reduced-motion animation reset now uses !important to beat per-ID animation-name specificity.

README unchanged during this correction; no picture/static companion created. Latest root steering requires native-system RAWIMG validation before considering alternate assets and supersedes earlier v2 picture proposal. Planner changed after launch to v3 by coordinator without changing SVG correction scope; launch records prior planner digest and this receipt binds actual v3.

Temporary runner /tmp/projects-svg-hero-swarm-20261007/browser-check.cjs: shared ws://127.0.0.1:9320/16-case matrix retained. Owned contexts only close; shared browser never restarted or closed. Main RAWIMG emulated-reduce failures remain explicitly labeled diagnostic, never claimed zero motion. Acceptance aggregate additionally requires4 owned native forced-reduce RAWIMG cases (light/dark360/900), matchMedia true and zero actual PNG delta. Only separately owned Chromium process launched using installed executable; close own process. Default chromium.executablePath(), optional HERO_CHROMIUM_EXECUTABLE override. No installs/network origins beyond routed synthetic fixtures.

Direct samples check viewBox, screen viewport/root bounds, text/card containment, visible marker/text collision and DejaVu fallback. Actual IMG marker-colored pixels isolated by subtracting identical in-memory hidden-marker baseline (no additional product asset), providing per-frame centroids. Representative normal light900 samples1/4.3/5.5/5.9/8/8.4s require within-wall and within-widget coordinate movement, preventing opacity-only false passes. Native diagnostics preserve original image bytes. Other HTTP/WS requests aborted. Browser execution/preflight/lock remains coordinator responsibility.

## Evidence

- Python ElementTree/security/prohibited tags/resources/local ID references/size/responsive CSS/guide tracked-link: PASS exit0. Final XML reparsed after !important change.
- git diff --check: PASS exit0 after final edits.
- node --check browser-check.cjs: PASS exit0 after final edits.
- Installed Cairo DejaVu Sans fallback bounds: moderation right290<=333, wall right600<=607, widget right555<=607. PASS exit0; existing lib only, no install.
- SVG bytes: 6174; SHA256: 99a07d2431b5bb7c942171320b12b0e0b305904e218072b5c659b3cce652b497.
- README SHA256 unchanged: 0b9087a4a6a9df1f3727ee90e5e43fdfc5ca74d5e39eb5647c044cc72b72112c.
- Runner SHA256: fa74237af7c0b3284b2a4508e06ae1883e966e1ccffffe402a87bcb7cd3647a7.
- Browser matrix/native assertions not executed by author; no E2E pass asserted. Browser first attempt preserved unchanged.

Primary sources checked: [Chromium animation.cc](https://raw.githubusercontent.com/chromium/chromium/main/ui/gfx/animation/animation.cc) confirms native switches override platform preference (lines134–145). [WebKit bug283894 comments3/4](https://bugs.webkit.org/show_bug.cgi?id=283894) distinguish system preference from inspector override in embedded SVG; this supports the diagnostic method, not a claim about tested Chromium results. Googlesource primary URL returned inaccessible; official Chromium GitHub mirror used.

ROUTE: S presentation-only correction, no app/public/provider/payment/data boundary. E2E preflight not_applicable for author static stage. No push/publish/PR/release/commit/install/full app build. Profile model-routing-econom; requested gpt-6.1-sol medium; actual model/effort null (host lacks authoritative metadata). Usage/cost null (counters unavailable). Elapsed wall 290.1seconds; active time null. Next responsible actor: coordinator runs browser/native checks and independent re-review against these SHAs.

Status: completed
