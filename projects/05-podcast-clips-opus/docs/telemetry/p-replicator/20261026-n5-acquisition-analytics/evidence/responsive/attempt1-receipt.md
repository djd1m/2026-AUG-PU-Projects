# Responsive attempt 1 — not passed

Source: 5172578f25643617f3cfd632af8c5797237aae65. Initial build: _NtINa99LXtL1DHwo3otS.
Target: synthetic TEST backend through https://localhost inside existing codex-ui-playwright. Actual run: 2026-10-26 19:00:14.246–19:08:44.473 UTC, duration 510.227s.
Actual command: docker exec -w /tmp/n5-acquisition-responsive-20261026 codex-ui-playwright node runner.mjs.
Actual exit: 2. NOT pass. 205 pages completed of206 expected; full default engines/widths/devices, both themes, all five routes plus first-screen checks attempted.

Evidence: out/report.json, out/summary.md, out/*.png, runner-result.json, run.log and preflight.json in this directory; corresponding runner/out retained under same /tmp path in container. Approximately34MB artifacts. No repo edits or commits by this responsive attempt.

Harness adaptation: copied original check-responsive.mjs and responsive helpers unchanged; their hashes recorded in preflight.json. Existing Playwright1.63, copied existing axe dependencies, no package install/manifests changes. Browser contexts accept localhost self-signed TLS; all vendor SDK requests would be fulfilled locally, other external origins aborted. Actual vendorRequests=0, blockedExternal=0. Synthetic existing account/video/clip only; created local TEST clip_link and sent guest_pack rows (no send to a person); authentication/session and synthetic link_view/guest_opened DB effects. No models/workers/content upload/payments/live traffic.

Findings and limits:
-1 execution error: WebKit light first-screen375x667 ready route did not expose clip/video before timeout.
-40 error findings:32R2 target-size plus1axe target-size, all in late WebKit light1440 dashboard/ready pages; screenshots visually confirm pages lacked CSS.7R9 findings ready-page clip actions below first fold at375x667/360x740 in both engines/themes.
-405 axe warnings retained unchanged.
-Root confirmed that a concurrent .next build occurred near end of this run. Therefore initial immutable runtime/build assumption was violated for late pages; unstyled screenshot is observed, asset drift is a supported cause. This attempt cannot establish final-build responsiveness or attribute late R2 errors to feature CSS.
-The one-clip synthetic fixture visibly adds the existing 'Найдено фрагментов:1' notice and moves clip actions below fold. This R9 edge is preserved as unpassed; analytics consent is below main and no causal comparison off/on was performed. No layout or validator was changed to hide it.
-Manual screenshot inspection: webkit-light-width-1440-195.png unstyled; chromium-dark-first-screen-375x667-45.png styled and displays one-clip notice above preview. Screenshots are evidence, not substitutes for assertions.

Continuation: coordinator owns FINAL immutable build/restart. Newly authorized synthetic3clip fixture will exercise normal3–8clip flow in a fresh bounded attempt after explicit FINALready. Retain this failed attempt and one-clip R9 limitation. No background process from attempt1 remains.
Requested profile model-routing-econom; actual model launch metadata held by coordinator; usage/cost null (not exposed).
Status: completed
