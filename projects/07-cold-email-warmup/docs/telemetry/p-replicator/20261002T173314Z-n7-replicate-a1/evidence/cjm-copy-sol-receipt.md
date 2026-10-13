# N7 consent-copy correction receipt

Run-ID: 20261002T173314Z-n7-replicate-a1
Work-Unit-ID: n7-cjm-copy-sol
Attempt-ID: cjm-copy-sol-1
Source-Revision: 55502bf906e1a755da3e866ee3739d3962236543
Launch-SHA256: 335cb26aa1e4b1a165be85d48008ab092fa9a1ad2d1eec9dbd1cbbbc0d39e62e
Trace-Prelaunch: absent
Started-At: 2026-10-02T18:39:32Z
Profile: compact-quality-first-v2
Requested-Model: gpt-6.1-sol; requested effort: high, per preserved launch metadata.
Actual-Model: null; actual effort/usage/cost null — host metadata unavailable.
Scope: N7-V01 peer-data visibility disclosure adjacent warmup consent; N7-V02 queue/in-flight boundary copy adjacent consent and queue explanation; no runtime logic change.
ROUTE: S bounded HTML copy and focused assertions; substantive scope preserves all runtime guards, no real sending/payment/provider requests. Existing companion instructions remain applicable; parent owns ledger.
Runtime-hash-comparison: [{"file": "operator-review.html", "runtime_js_sha256_unchanged": "4c3dfff509c54ab4fc6e33c0b5e7a6efde9f134a28f31101ddb9f1866ede7094"}, {"file": "cohort-desk.html", "runtime_js_sha256_unchanged": "4c3dfff509c54ab4fc6e33c0b5e7a6efde9f134a28f31101ddb9f1866ede7094"}, {"file": "partner-studio.html", "runtime_js_sha256_unchanged": "4c3dfff509c54ab4fc6e33c0b5e7a6efde9f134a28f31101ddb9f1866ede7094"}]


Preflight-At: 2026-10-02T18:41:20.045673+00:00
Source-Snapshot-SHA256: 38c6c957a98e1a18872ec883e4289cd8a07580d09ee2b0552e725ebe05bc2fae
Build-Snapshot-SHA256: 38c6c957a98e1a18872ec883e4289cd8a07580d09ee2b0552e725ebe05bc2fae; standalone static HTML equals build.
Preflight: ready. Existing codex-ui-playwright@1.63.0 with ws://127.0.0.1:9320/; one Chromium context at a time; N6b coordinator confirmed no browser conflict. Inputs three changed HTML plus focused checker. Effects local browser DOM/screenshots/checks JSON only; requests aborted. No email/payment/provider requests.
Command-as-data: docker exec codex-ui-playwright node /opt/browser/n7-cjm-copy-20261002/check-cjm.mjs --copy --output /opt/browser/n7-cjm-copy-20261002/evidence
Static-check: exit0; 57 unique IDs per HTML, valid references/links and JS syntax, no external dependency.


Finished-At: 2026-10-02T18:42:11.153689+00:00
Build-Revision: null (matches launch; standalone static artifacts have snapshot above, no compiled build).
Verdict: pass — exact disclosure and queue/in-flight copy visible in all three prototypes.
Checks: static exit0; focused browser exit0; 3 HTML ×1440/390 show exact disclosure next to warmup checkbox, cancellation caveat at consent and expanded queue explanation; initial independent consent remains unchecked; keyboard Space only toggles focused warmup checkbox; launch remains blocked; no consent/queue horizontal overflow or runtime errors. All runtime JS hashes unchanged.
Evidence: docs/telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/cjm-copy-browser/checks.json and six fresh consent screenshots.
Corrected-Source-Hashes: [{"file": "cohort-desk.html", "sha256": "9e464965d558a6cfdc3d7e8f1a99aa9a0ff70937dd1876f165074f1a38cf1172"}, {"file": "partner-studio.html", "sha256": "a61b702732881c4a09532f2f0ede6719841b0781655bf74533072b5d19d41bd2"}, {"file": "operator-review.html", "sha256": "eb6572948b0fa47a908a7d965ec89d5bee92d76a41a939933457f9869cf7f9df"}]
Limitations: Chromium only, static prototype copy checks; backend irreversible submitting boundary is described but not executed. No full WCAG audit, provider connections, real emails, payment or user-data writes. Earlier journey checks remain historical and were not rerun for unchanged logic.
Actual-Model: null; Usage: null; Cost: null; Duration-ms: null — unavailable per-work-unit host metadata. Receipt UTC timestamps are observed boundaries. No savings claim.
Pending accepted worker scope: none. Independent design revalidation belongs to coordinator.

Status: completed
