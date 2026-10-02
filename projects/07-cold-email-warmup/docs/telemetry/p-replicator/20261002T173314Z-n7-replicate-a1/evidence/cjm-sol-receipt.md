# CJM prototype work receipt

Run-ID: 20261002T173314Z-n7-replicate-a1
Work-Unit-ID: n7-cjm-sol
Attempt-ID: n7-cjm-sol-1
Source-Revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4
Build-Revision: not_applicable (standalone HTML, no build)
Started-At: 2026-10-02T17:34:42Z
Stage: IMPLEMENT
Profile: compact-quality-first-v2
Requested-Model: coordinator-selected Sol
Actual-Model: null (host execution metadata unavailable)
Usage: null (host counters unavailable)
Trace-Prelaunch: absent, freshly allocated by coordinator

Scope: three standalone Russian CJM HTML prototypes, no external dependencies; A network effect, B incentivized referral, C sales.
Exclusions: real sends, SMTP/IMAP connection, payment, external writes, browser installation and browser E2E.
AC: three distinct responsive keyboard-accessible alternatives; stateful consent, pool, sequence preview, bounded launch, stop-on-reply, suppression/complaint states, billing preview; honest demo metrics.
ROUTE: substantive S: bounded static design prototypes, no new external calls, payment processing, runtime public route or schema. Billing is inert preview. Mechanical explicit three HTML paths: exit 0, tier S. Repeat substantive ROUTE before implementation: unchanged S.
Preflight: not_applicable; owner requires existing deployed Docker Playwright and endpoint currently unknown; no E2E claim.
Forecast: insufficient_data; bounded attempt budget 20 minutes; coordinator informed.
Skill: project-work-companion read for preparation/handoff; no new work-record created because coordinator owns integration ledger and my ownership is limited to this receipt and HTML.


## Browser preflight (scope extension authorized by coordinator)

Preflight-At: 2026-10-02T17:43:31.591880+00:00
Source-Snapshot-SHA256: 0b8ef98c21ff5a0f70257b4080a4248da0460b1f57af88def65a8a07d0ac297d
Build-Snapshot-SHA256: 0b8ef98c21ff5a0f70257b4080a4248da0460b1f57af88def65a8a07d0ac297d (static HTML equals build)
Environment: existing container codex-ui-playwright, running=true; Playwright 1.63.0 confirmed via package metadata; ws://127.0.0.1:9320/ Playwright connect endpoint confirmed by root.
Allowed-effects: docker cp fixtures into unique /opt/browser/n7-cjm-20261002 path; local browser contexts, screenshots and checks JSON only. Requests aborted; no SMTP/IMAP, payment, real sending or network writes.
Inputs: 3 standalone HTML + check-cjm.mjs; desktop1440 and mobile390; Chromium only, reduced motion.
Test-command-as-data: docker exec codex-ui-playwright node /opt/browser/n7-cjm-20261002/check-cjm.mjs --output /opt/browser/n7-cjm-20261002/evidence
Readiness: ready
E2E-Claim: pass (prototype-only, source bound to corrected snapshot below)
External-Actions-Executed: false
Static-check: exit0, three HTML, 54 unique IDs each; links and label references valid; syntax valid, no external dependency; 68lines each.


Visual review: desktop A/C and mobile B screenshots inspected; layouts readable, no overflow. One confirmed copy finding: stopped reply gate named its affirmative prerequisite instead of actual stop reason. Corrected gate reason and blocked-status wording, added assertion.
Repeat browser preflight: 2026-10-02T17:45:13.681778+00:00, ready; same existing environment, command and local-effects envelope. New source/build snapshot SHA256: b252d0a63dd62a589427650d1462b86787e8e5a9d7271a029771f0bc9e5b8fec. Repeat justified by changed gate wording in all three HTML; previous successful check preserved in this receipt.


## Terminal evidence

Finished-At: 2026-10-02T17:46:28.527223+00:00
Verdict: pass — CJM prototype scope only; independent integration review belongs to coordinator.
Build: standalone inline HTML/CSS/JS, no compilation needed; syntax check passed.
Checks: node docs/cjm/check-cjm.mjs --static exit0; browser via existing Docker Playwright exit0. Three files × desktop1440/mobile390 passed keyboard skip-link, six stage layouts without horizontal overflow, invalid email guard, separate consent, required stop-list confirmation, invalid limits, limit-change consent revocation, escaped personalization, launch/revocation, reply-stop, complaint pause, suppression, invitation consent and billing preview. No browser runtime errors. Launch-gate mutation applied and detected.
Evidence: docs/telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/cjm-browser-corrected/checks.json plus 12 corrected-source PNGs; initial results/screenshots retained in cjm-browser/ for preceding confirmed-copy correction.
AC mapping: 3 distinct design/growth alternatives pass; Russian standalone <500 lines pass; accessible keyboard/targets/reduced-motion implementation pass within tested checks; consent/seed/sequence/limits/launch/reply/complaint/suppression/billing flow pass; honest demo and unknown reputation pass.
Source hashes: [{"file": "cohort-desk.html", "sha256": "3a5b281ad20f13759f52f198f9377ba9eb264e7788a079865cb93a1447e3f57b"}, {"file": "partner-studio.html", "sha256": "4d067b809dfedd094680899e0bdd2b7e9f9d5735bdc02fe1f9a8f5123cc1870b"}, {"file": "operator-review.html", "sha256": "5665ab7cb814092486e7c91f1fa456526f3558cc4f17211cb6a3e316bb4d7728"}]
Launch-SHA256: null — coordinator did not provide a serialized launch digest to this worker; supplied work order and fresh trace allocation are recorded above. Companion structural validation not claimed by this worker; integration owner binds expected launch metadata.
Actual-Model: null; actual-effort and fallback: null — host metadata unavailable.
Input/output/cached/reasoning tokens, cost, elapsed_wall_ms, active_wall_ms: null — per-work-unit host counters/timing unavailable; explicit receipt UTC timestamps are observed boundaries, not full-host duration.
Limitations: Chromium only; no full WCAG audit, screen-reader test or provider deliverability measurement. SMTP/IMAP, sending, payment, invitations and server-side anti-fraud are simulated or described; backend acceptance not claimed. Network effect and partner payout remain hypotheses. No numerical economy claim.
Pending accepted worker scope: none. Backend/source-product capture: out_of_scope, coordinator owned.
Delivery-URI: urn:n7:cjm:20261002T173314Z-n7-replicate-a1:n7-cjm-sol

Status: completed
