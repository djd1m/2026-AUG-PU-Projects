# Narrow final UI runtime closure

RUN_ID: 20261014T064554Z-public-ui-53d8
WORK_UNIT_ID: public-ui-final-closure-1
Attempt-ID: final-ui-closure-1
Source-Revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4
Build-Revision: sha256:f6d232b54b398c5175769af4f78369853b4880d8952119a9057326e94010df03
Launch-SHA256: 1a26c7d96fc5defa0867b5f3484f1803fc10bb364c4b8944cac4f3bb9b1fcd5d
Finished-At: 2026-10-14T07:27:52.938335+00:00
Verdict: pass

This is a separately authorized, bounded final stage. It does not overwrite public-ui-review-1.md or failed audit history. Source revision names the baseline repository commit; implemented production files were untracked at integration and are identified by the actual146-file filesystem snapshot below. A baseline commit alone is not a claim that runtime code was committed.

## Exact evidence and checks

- public-source-image-3.json binds146 production/build files to corrected app image above and reports actual host/image match. Independently recomputed current host SHA256 for all146 entries: no differences. This reviewer consumes coordinator image-extraction evidence and does not repeat Docker extraction.
- Mounted runner scripts/public-ui-audit.mjs SHA256 e3b1e8d7e3d2564aed530522cda3dc1b206c02300a9070599b96e4e45820604a matches source-image3 and fresh public-ui-audit-3-preflight.json. Its dedicated browser image is sha256:c4f72c941c3eef79eeccb36dbbac303ae0741af920cb2e89c5a322040218a424. compose.e2e.yml declares exact runner path mounted :ro; browser service environment has public origin/attempt/evidence/build/browser configuration and no database/provider credentials. Script/context contains no ignoreHTTPSErrors or browser TLS-bypass flags. Fresh preflight3 is ready.
- public-ui-audit-3/result.json: passed57 checks, zero axe violations, browser exceptions and tracked unexpected outbound requests, Chromium/Firefox/WebKit, finished2026-10-14T07:24:17.726Z. Its build matches this launch. Each engine has explicit keyboard ArrowRight/Home/End/Enter and injected422 input-preservation/focus checks. Normal WebKit TLS navigation succeeded; previous TLS failure is not converted into a pass.
- public-journey-2/result.json:21/21 passed on this app image, finished2026-10-14T07:21:20.938Z, errors/outbound empty. New receipt states manual/off through /api/me instead of the old literal liveCalls counter.
- Viewed corrected WebKit390 budget and typed422 screenshots: totals and captions are separated; retained rows use Russian explanation; typed error is visible while limit12345 and unfinished reason remain. The alert-focus assertion passed. Source correction review from the initial receipt confirms cost-ID labels map to saved immutable cost names and tab ARIA/keyboard semantics.
- Coordinator reports UI source typecheck/lint passed and corrected driver lint actual exit0 from completed session50891; ui-driver-lint-1.txt contains the clean command output. No lint, browser, Docker or application test is executed again by this reviewer.

## Closure of original findings and anti-drift

PUI-01 contrast: closed, source #5b695d gives5.177 on paper and final axe0. PUI-02 merged totals: closed in source and corrected desktop/mobile screenshots. PUI-03 technical retained/delta labels: closed by bounded presentation mapping, preserving visible arithmetic formula and stored calculations. PUI-04 keyboard semantics/proof: closed by small Tabs component plus explicit three-engine keyboard checks. PUI-05 error-input/focus proof: closed for budget client behavior by explicit three-engine injected422 assertions and screenshot. PUI-06 WebKit TLS gap: closed by CA trust in test image and normal TLS navigation. Audit2 strict alert selector failure was narrowed to active tabpanel; audit3 passes that driver correction. No original UI finding remains open.

Corrections touch presentation and step interaction. Immutable room geometry, design approval, budget unknowns/arithmetic/history, private storage, server ownership, public sharing/revoke and live-provider defaults remain unchanged. There is no new product scope, API route or external call introduced by these fixes. Foundation234/API tests are prior coordinator evidence; this receipt does not claim they were rerun against UI build.

Browser results establish tracked browser behavior in the tested scope, not universal server/worker network instrumentation or WCAG certification. The422 is injected only into the browser request route and proves frontend preservation/focus, not production backend rejection. The initial21-step evidence retains broader owner/guest/security coverage; final21-step rerun covers the same journey on corrected image. Ingress/remote200/private-port evidence and final deployment handoff belong to coordinator/separate ingress reviews; no independent external fetch is made by this reviewer. Manual AI, payments off and manual catalog boundaries remain explicit; no paid provider call is performed here.

## Telemetry correction and boundaries

Profile: compact-quality-first-v2. Actual model, effort, usage and cost are null because execution metadata/counters are unavailable; no measured model switch or savings claim. Measured wall duration from this launch: 159.40 seconds, within the separate5-minute stage; active time unavailable.

Correction to initial immutable receipt: its Finished-At is07:25:53.189960Z, measured902.623046 seconds from07:10:50.566914Z, exceeding15 minutes by2.623046 seconds during receipt creation. Its sentence claiming the budget was respected is inaccurate. That record is retained unchanged; this explicit correction supersedes only that timing interpretation. No optional additional product review was undertaken during the overrun.

Accepted bounded final UI runtime scope passes; no pending UI correction or runtime closure remains. Root retains sole product writer and final release aggregation authority.

Status: completed
