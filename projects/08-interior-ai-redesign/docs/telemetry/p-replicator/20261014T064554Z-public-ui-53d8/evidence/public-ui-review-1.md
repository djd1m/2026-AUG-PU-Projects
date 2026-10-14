# Independent public UI and anti-drift review

RUN_ID: 20261014T064554Z-public-ui-53d8
WORK_UNIT_ID: public-ui-review-1
Attempt-ID: ui-review-1
Source-Revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4
Build-Revision: sha256:7c488e9eef1afcbad315cf58751980bee8d7b33242f95392ed8d5a8c12930c74
Launch-SHA256: 60e83ddc30c457255c41d83ace3a80c4c3fd8ae7c4f072b21e86d774cc0462b8
Finished-At: 2026-10-14T07:25:53.189960+00:00
Verdict: pass

The launch remains bound to the initial image above. Initial findings and their later correction closure are distinguished below; initial failed audits are preserved. Final runtime closure concerns corrected build sha256:f6d232b54b398c5175769af4f78369853b4880d8952119a9057326e94010df03, not a retroactive pass of the launch image.

## Scope and execution

Read-only product review of public UI, scripts/e2e.mjs and scripts/public-ui-audit.mjs, canonical NFR-quality/SC-US-018/022/023, and six public AC in ../plan.md. Read root/project CLAUDE, relevant local testing/security and root complexity/model/telemetry/receipt rules, plus project-work-companion delivery contracts. Root is sole product writer. This reviewer starts no Docker container, daemon, installation, suite, live provider call or external fetch; it writes only this receipt. Reviewed room mobile, budget desktop/mobile, public share, design/products mobile, Firefox GLB/billing, and corrected Chromium/WebKit budget/error screenshots. No new full redesign or optional polishing round was opened.

Profile: compact-quality-first-v2. Requested model/effort: inherited independent Astra high review assignment; actual model/effort/usage/cost: null because host execution counters and model metadata are unavailable. No confirmed model switch. Measured wall elapsed from preallocated launch to this receipt: 902.62 seconds; active time unavailable. Budget: 15 minutes, respected.

## Findings and narrow closure

- PUI-01, medium, closed: audit1 found muted #667568 on paper #f5f2e9 contrast4.35 below4.5, across20 screen-level violation records. Root changed muted to #5b695d; independently calculated ratio5.177. Corrected audit3 reports zero WCAG-tagged axe violations.
- PUI-02, medium, closed: initial budget screenshots merged value and label as “17 500,00 ₽Известная часть” and “0Требуют уточнения”. Root added .stats grid and block value/label styles. Corrected Chromium1440/390 and WebKit390 screenshots visibly separate totals and labels.
- PUI-03, low, closed: retained purchase rows exposed English internal explanation and budget diff exposed service:/delivery: IDs. Root localized retained explanation and maps immutable expense IDs to saved labels. Numeric ceil formula remains visible as required; arithmetic and snapshots were not changed.
- PUI-04, medium verification/semantics gap, closed: original audit switched steps with clicks and asserted only activeElement != body. Root reused a bounded Tabs component with manual keyboard activation, ArrowLeft/Right, Home/End, selected-tab tabIndex, ID/controls/labelledby links, and visible panel focus. Audit3 explicitly passed ArrowRight/Home/End/Enter for all three engines.
- PUI-05, medium verification gap, closed: initial journey exercised malformed GLB via API, not unfinished form input after typed error. Audit3 injects a client-only422 for budget POST, checks limit12345 and reason remain, and asserts alert receives focus for Chromium/Firefox/WebKit. This proves frontend handling, not production server validation of that synthetic response.
- PUI-06, runtime gate, closed: audit1 stopped on WebKit TLS rejection; it never established WebKit acceptance. Root added CA trust in dedicated browser image, retaining ordinary TLS validation. Audit3 reached WebKit landing/login/steps/GLB/billing and passed.

Audit2 stopped after16 Chromium checks due to a strict selector matching both budget alert and Next route announcer. Its axe violations/errors/outbound were empty. Root corrected only runner selector and mounted exact script read-only for audit3; fresh preflight records runner SHA e3b1e8d7e3d2564aed530522cda3dc1b206c02300a9070599b96e4e45820604a. This failed attempt is a driver failure, not a product or browser pass.

## Source and runtime evidence

Initial public-source-image-1.json reports145 host/image files matched for launch image; public-journey-1/result.json passes21 checks. Root corrections changed CSS, RoomEditor, BudgetPanel and added Tabs. public-source-image-2.json reports147 files matched for corrected image, including new Tabs and original audit runner. This reviewer independently recomputed current host hashes against those147 entries and found no differences before runner-only selector correction. No image extraction is independently repeated by this reviewer. The mounted runner change is explicitly separately hashed in public-ui-audit-3-preflight.json; product files remain those of image2.

public-journey-2/result.json:21/21 passed on corrected image, errors/outbound empty, finished07:21:20.938Z. public-ui-audit-3/result.json:57/57 passed on corrected image, Chromium/Firefox/WebKit, zero violations, browser exceptions and tracked unexpected outbound requests, finished07:24:17.726Z. Fresh preflight3 is ready and binds corrected application image, dedicated browser image and exact runner. Typed-error mobile screenshot shows error text and retained input; corrected WebKit budget screenshot shows separated totals and localized retained copy.

## Anti-drift and limits

The fixes preserve immutable measured shell, explicit design approval, unknown budget values, saved-history calculations, private assets, ownership, share privacy/revocation and manual/off boundaries. Tabs retain prior inactive-panel unmount behavior. No blocker remains in this bounded UI scope. Original canonical21-step journey covers owner/foreign-owner, private derivatives, public share/revoke, CSV, GLB and WebGL fallback; it does not prove every possible keyboard action or certify WCAG compliance.

Browser routing evidence proves no tracked unexpected browser request in the tested primary contexts. APIRequestContext/server traffic is not universally instrumented; guest/fallback guards originally aborted external requests without recording them. Initial liveCalls:0 was a literal, not a measured global provider counter. Journey2 correctly replaces that with manual/off assertion through /api/me. Runtime config and worker source only instantiate live AI when configured; this review claims no paid inference or payment test. No independent remote external200 fetch was performed here; TLS/ingress acceptance relies on coordinator and separate ingress evidence, not this UI receipt. Existing234-test regression/type/lint/audit reports are coordinator evidence and were not rerun by this reviewer.

Public AC4/5 UI review closes for the corrected build. AC1/2 ingress security, full AC3 image construction and AC6 final handoff remain coordinator/separate-review aggregation. No accepted-scope UI fix is pending in this receipt.

Status: completed
