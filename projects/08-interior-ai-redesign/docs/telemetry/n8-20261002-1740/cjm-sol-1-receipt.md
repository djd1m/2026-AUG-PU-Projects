# N8 RoomKind — CJM HTML implementation receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: cjm-sol-1
Attempt-ID: cjm-sol-1-attempt-1
Source-Revision: a05cfca76614346f46d0904c8d3a9692429b0a68
Source-Snapshot: sha256:f0d3e13d3b98a4e37cde1d7ee4028161e6fa4ed8daf08c43bbdd40909d938044
Build-Revision: not_applicable (standalone static HTML; no compilation, dependencies, npm or CDN)
Launch-SHA256: bdf7d49c95d370cac2ff42458716d548e34c0d4c43e2764f4cffe6f6494a20bf
Finished-At: 2026-10-02T18:05:49.244048+00:00
Verdict: pass (bounded static CJM unit only)

## Delivered scope

Three independent standalone RoomKind variants and a linking index. A is selected, with content-driven sharing; B explores a badge sheet; C preserves the rejected incentivized-referral hypothesis, explicitly stating rewards and engine are not implemented. Every journey has landing, local upload/illustrative input, style, fixture queue, compare, private gallery, paywall fixture. Primary-source Houzz/Pinterest microtrend links match docs/CJM_Variants.md. Proposed 900 RUB / 20-generation package remains pending approval. Share requires separate preparation and confirmation; opt-in starts unchecked, publication is local demo state, revoke clears it. Download/share/payment never perform external effects.

## Checks and source binding

- Python static guard: pass / exit 0; visible mock disclosure, exactly one unchecked consent checkbox, no remote scripts/fetch/innerHTML.
- Guard mutation: pass / harness exit 0; actual guard subprocess exit 1 for inserted prechecked consent and removed visible mock disclosure. Original files unchanged.
- Embedded JS syntax and e2e.cjs syntax: pass / exit 0.
- Existing shared Chromium via native Playwright WS, Playwright 1.63.0: final attempt 5 pass / exit 0, 6 journeys (A/B/C at 1440 and 390), 42 screen assertions; no horizontal overflow; index 3 links and mobile layout pass.
- Keyboard input/style controls, arrow-key compare moves split from 50% to 51%, Space opt-in, distinct share attempt/completion, revoke, quality rejection, payment fixture all pass.
- Malicious-looking local filename rendered literally via textContent; no injected img node. No remote requests or page errors in final runs.
- Immediately-before-E2E source/environment/inputs/effects preflight preserved for each actual attempt. Final source digests are in cjm-sol-1-source.json; browser readiness never treated as app acceptance.
- git diff --check: exit 0. No compiled build applies to this static fixture.

## Actual failures and correction

Attempt 1 used CDP against a native Playwright endpoint and failed before UI interaction; corrected harness after reading existing smoke script. Attempt 2 could not write screenshots/reports as pwuser in the root-owned docker-copy directory; runner corrected to root within its unique namespace without configuration changes. Attempt 3 found a strict duplicate harness upload locator; scoped it to landing. Attempt 4 passed desktop A/B/C then found actual mobile A landing scrollWidth 418 at viewport 390. Decorative rotated ::before referenced the initial containing block on mobile. Adding position:relative to preview fixed the responsive defect; regenerated fixtures and reran affected responsive journeys. Attempt 5 passed all six journeys. Prior available failure JSON and preflights are retained, with screenshots from final successful run. Browser released 2026-10-02T18:03:56Z.

## Route, model, and measurements

Profile: compact-quality-first-v2; bounded single coder under the parent N8 XL checkpoint. Initial mechanical route S / exit 0; implementation route L / exit 1 from GRANT/role substrings in demo consent/ARIA, without database access, public production paths or external calls. Substantive bounded scope S; parent XL approval/review requirements remain intact.
Requested-Model: gpt-6.1-sol / high (parent assignment)
Actual-Model: null (worker has no host/provider metadata proving actual execution; self-report is not proof)
Model-Evidence-Available: parent dispatch context only; parent must reconcile host-authoritative metadata
Fallback: null / not observable to worker
Elapsed-Wall-MS: 939244 (includes reads, implementation, coordination, E2E retries; end measured before commit)
Active-Wall-MS: null (full wait accounting unavailable)
Usage-Tokens: null
Cost: null / unavailable
E2E-Retries: 4 (three harness/environment corrections and one actual responsive finding)
Model-Escalations: no worker-requested model changes
Экономия пока не установлена; no comparative baseline or measured usage.

## Limits and parent handoff

This receipt accepts static UI fixtures, not N8 production/MVP. Real GPU generation, geometry gate, performance, backend upload validation/EXIF, private access control, actual share/export, cookie attribution, hosted checkout, ledger and reward engine are out of this unit. Public opt-in and payment are explicitly demo state only. Actual-model proof, independent review, integration and delivery of the broader project belong to the coordinator. No push performed. All changes confined to allocated paths.

Changed-Files:
- docs/cjm/check.py
- docs/cjm/e2e.cjs
- docs/cjm/generate.py
- docs/cjm/index.html
- docs/cjm/variant-a.html
- docs/cjm/variant-b.html
- docs/cjm/variant-c.html
- docs/telemetry/n8-20261002-1740/cjm-sol-1-a-desktop.png
- docs/telemetry/n8-20261002-1740/cjm-sol-1-a-mobile-result.png
- docs/telemetry/n8-20261002-1740/cjm-sol-1-b-desktop.png
- docs/telemetry/n8-20261002-1740/cjm-sol-1-c-desktop.png
- docs/telemetry/n8-20261002-1740/cjm-sol-1-e2e-attempt-3.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-e2e-attempt-4.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-e2e.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-preflight-attempt-1.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-preflight-attempt-2.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-preflight-attempt-3.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-preflight-attempt-4.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-preflight.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-progress.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-source.json
- docs/telemetry/n8-20261002-1740/cjm-sol-1-receipt.md

Status: completed
