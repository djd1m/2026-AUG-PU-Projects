# Responsive attempt 2 — pass on normal synthetic3clip flow

Source:0394ff992449b242c1b08c8bc6b2c48a407c2baa.
Build:hxEK12n0eBPDX-JWDz55D.
Preflight:ready, recorded immediately before actual E2E in preflight.json. Source/build match unchanged postflight.json; copied validator/CSS/server source hashes also match initial snapshot.
Target:isolated synthetic TEST backend through https://localhost inside existing codex-ui-playwright. No production VPS or deployment touched.

Command:docker exec -w /tmp/n5-acquisition-responsive-20261026-attempt2 codex-ui-playwright node runner.mjs.
Started:2026-10-26T19:13:21.603Z.
Finished:2026-10-26T19:22:19.261Z.
Duration:537.658seconds.
Actual exit code:0.
Result:206pages completed;0execution errors;0error findings;646R4warnings retained in report without suppression. Full stock default matrix:Chromium and WebKit;dark/light;device presets and320,360,390,414,768,1024,1440widths;landing,shortlink,guest,dashboard,ready detail;stock first-screen selectors/viewports and200%text checks. No matrix narrowing or validator modifications.

Harness adaptation:only localhost self-signed TLS acceptance inside contexts that abort other external origins;vendor SDK requests fully intercepted if requested. Actual vendor requests0,other external blocked0 because stock flow never opts in. Measured container Nodev24.20.0/Playwright1.63.0 and copied existing @axe-core/playwright/axe-core dependencies;no new package install or manifests. Original scripts/check-responsive.mjs and helpers byte-for-byte unchanged, digests in preflight.json. This tests default-off consent UI, not SDK provider receipt;root's separate intercepted official SDK E2E owns those claims.

Fixture:existing synthetic account/video/available clip,TEST DB asserted suffix_test. Owner-authorized preparation created2additional done clips by cloning synthetic row metadata/object references (no rendering or worker/model calls) and set video counts3/3. Reused synthetic shortlink and sent guestpack from attempt1;only local fixture business rows/auth sessions/link_view/guest_opened effects. No actual messages,uploads,email,payments or live counter requests. Credentials remain private /tmp fixture and are absent from this receipt/repository.

Evidence (host and container same prefix):out/report.json,out/summary.md,out/*.png;runner-result.json;preflight.json;postflight.json;run.log;unchanged copied scripts and harness runner.mjs. Screenshots35MB;free disk aftercopy approximately3.1GB. No responsive process remains active.
Manual screenshot inspection:chromium-dark-width-1440-38.png and webkit-light-width-1440-195.png show styled desktop layouts and consent controls;chromium-dark-first-screen-375x667-45.png shows first-card actions within first screen for3clip normal flow. Screenshots supplement assertions, not replace them.

Preserved limitation:attempt1 remains exit2,205pages with late asset drift and1clipR9 findings in /tmp/n5-acquisition-responsive-20261026/responsive-receipt.md. This pass DOES NOT establish that the1clip edge is fixed or analytics caused it. That edge needs its own controlled off/on comparison or separate product scope;no product layout was altered to hide it. Embedded Telegram/VK real-device behavior and live provider report ingestion are not established by this emulated browser matrix.

Requested profile:model-routing-econom,gpt-6.1-sol medium;actual launch metadata coordinator-owned;usage/cost:null(not exposed). No source edits/commit in this responsive attempt.
Verdict: pass for defined normal3clip full stock matrix on exact frozen source/build.
Status: completed
